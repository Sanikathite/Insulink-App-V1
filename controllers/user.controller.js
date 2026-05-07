"use strict";
 
const db = require("../models");
const { User, Role } = db;
const authService = require("../services/auth.service");
const { handleError, sendError } = require("../functions/sendResponse");
const { Op } = require("sequelize");

exports.create = async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    if (!req.user) {
      await transaction.rollback();
      return sendError(next, "Unauthorized", 401);
    }

    const name = req.body.name ? req.body.name.trim() : "";
    const email = req.body.email ? req.body.email.trim() : "";
    const contact = req.body.contact ? req.body.contact.trim() : ""; 
    const { password, role_id } = req.body;

    if (!name || !email || !password || !role_id) {
      await transaction.rollback();
      return sendError(next, "All required fields must be filled", 400);
    }

    // 1. Strict Name Uniqueness Check
    const existingName = await User.findOne({ where: { name } });
    if (existingName) {
      await transaction.rollback();
      return sendError(next, "This user name already exists", 409);
    }

    // 2. Email Uniqueness Check
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      await transaction.rollback();
      return sendError(next, "This email address already exists", 409);
    }

    // 3. Contact Uniqueness Check (Only if provided)
    if (contact !== "") {
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(contact)) {
        await transaction.rollback();
        return sendError(next, "Phone number must be exactly 10 digits", 400);
      }

      const existingContact = await User.findOne({ where: { contact } });
      if (existingContact) {
        await transaction.rollback();
        return sendError(next, "This phone number is already registered", 409);
      }
    }

    // 4. Role Validation
    const role = await Role.findOne({ 
      where: { 
        role_id, 
        status: { [Op.ne]: "INACTIVE" } 
      } 
    });
    
    if (!role) {
      await transaction.rollback();
      return sendError(next, "Selected role is invalid or inactive", 400);
    }

    // 5. Finalize and Create
    const hashedPassword = await authService.hashPassword(password);
    
    const createdUser = await User.create(
      {
        name,
        email,
        contact,
        password: hashedPassword,
        role_id,
        account_status: "ACTIVE",
        created_by: req.user.name,
        updated_by: req.user.name
      },
      { transaction }
    );

    await transaction.commit();
    const payload = createdUser.get({ plain: true });
    delete payload.password;
    res.locals.data = payload;
    next();

  } catch (error) {
    if (transaction) await transaction.rollback();
    handleError(error, next, "Internal server error while creating user");
  }
};
 
exports.getAll = async (req, res, next) => {
  try {
    // 1. Capture filters from query string
    const { role_id, account_status } = req.query;

    const where = {};
    if (role_id) where.role_id = role_id;
    if (account_status) where.account_status = account_status;

    const users = await User.findAll({
      where,
      // 2. Security: Never send the password hash to the frontend
      attributes: { exclude: ['password'] }, 
      include: [
        { 
          model: Role, 
          as: "role",
          // ✅ FIXED: Changed 'id' to 'role_id' and 'name' to 'role_name'
          attributes: ['role_id', 'role_name'] 
        }
      ],
      order: [["created_at", "DESC"]]
    });

    // 3. Store in res.locals for your sendFindResponse middleware
    res.locals.data = users.map(u => u.get({ plain: true }));
    next();

  } catch (error) {
    console.error("❌ user.controller.getAll error:", error.message);
    // Using your established sendError pattern or res.status directly
    return res.status(500).json({ 
      success: false, 
      message: "Error fetching users: " + error.message 
    });
  }
};
 
exports.getById = async (req, res, next) => {
  try {
     if (!req.user) {
      return sendError(next, "Unauthorized", 401);
    }
    const { user_id } = req.params;
    if (isNaN(user_id)) {
    return sendError(next, "Invalid user ID", 400);
   }
    const user = await User.findByPk(user_id, {
      include: [{ model: Role, as: "role" }]
    });
 
    if (!user) {
      return sendError(next, "User not found", 404);
    }
 
    res.locals.data = user.get({ plain: true });
    next();
 
  } catch (error) {
    handleError(error, next, "Error fetching user");
  }
};
 
exports.bulkUpload = async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    if (!req.user) {
      await transaction.rollback();
      return sendError(next, "Unauthorized", 401);
    }

    if (!Array.isArray(req.body)) {
      await transaction.rollback();
      return sendError(next, "Bulk upload payload must be an array", 400);
    }

    const input = req.body;

    let emptyCount = 0;
    let duplicateCount = 0;
    let invalidRoleCount = 0;
    let invalidContactCount = 0; // Added tracker

    /* ---------------- NORMALIZE INPUT ---------------- */
    const normalized = input.map(u => ({
      name: typeof u.name === "string" ? u.name.trim() : "",
      email: typeof u.email === "string" ? u.email.trim().toLowerCase() : "",
      contact: u.contact ? String(u.contact).trim() : "", 
      password: u.password,
      role_id: u.role_id
    }));

    /* ---------------- FILTER & BASIC VALIDATION ---------------- */
    const validUsers = [];
    const phoneRegex = /^\d{10}$/;

    for (const u of normalized) {
      // ✅ Updated: Removed u.contact from required check (since "" is allowed)
      if (!u.name || !u.email || !u.password || !u.role_id) {
        emptyCount++;
        continue;
      }

      // ✅ Validation: Format check if contact is NOT empty
      if (u.contact !== "" && !phoneRegex.test(u.contact)) {
        invalidContactCount++;
        continue;
      }

      validUsers.push(u);
    }

    if (!validUsers.length) {
      await transaction.rollback();
      return sendError(next, "No valid users found in payload", 400);
    }

    /* ---------------- FETCH EXISTING DATA FOR UNIQUENESS ---------------- */
    const emails = validUsers.map(u => u.email);
    const names = validUsers.map(u => u.name);
    const contacts = validUsers.filter(u => u.contact !== "").map(u => u.contact);

    const existingUsers = await User.findAll({
      where: {
        [Op.or]: [
          { email: emails },
          { name: names },
          { contact: contacts } // ✅ Added contact to DB check
        ]
      },
      attributes: ["email", "name", "contact"]
    });

    const existingEmailSet = new Set(existingUsers.map(u => u.email.toLowerCase()));
    const existingNameSet  = new Set(existingUsers.map(u => u.name.toLowerCase()));
    const existingContactSet = new Set(existingUsers.map(u => u.contact));

    const seenEmailSet = new Set();
    const seenNameSet  = new Set();
    const seenContactSet = new Set(); // To prevent duplicates within the payload itself

    /* ---------------- CHECK ROLES ---------------- */
    const roleIds = [...new Set(validUsers.map(u => u.role_id))];
    const roles = await Role.findAll({
      where: {
        role_id: roleIds,
        status: { [Op.ne]: "INACTIVE" }
      },
      attributes: ["role_id"]
    });
    const activeRoleSet = new Set(roles.map(r => r.role_id));

    /* ---------------- FINAL PAYLOAD CONSTRUCTION ---------------- */
    const finalPayload = [];

    for (const u of validUsers) {
      const emailKey = u.email.toLowerCase();
      const nameKey  = u.name.toLowerCase();
      const contactKey = u.contact;

      // ✅ Uniqueness Check: Email, Name, and non-empty Contacts
      const isDuplicateInDB = existingEmailSet.has(emailKey) || existingNameSet.has(nameKey) || (contactKey !== "" && existingContactSet.has(contactKey));
      const isDuplicateInPayload = seenEmailSet.has(emailKey) || seenNameSet.has(nameKey) || (contactKey !== "" && seenContactSet.has(contactKey));

      if (isDuplicateInDB || isDuplicateInPayload) {
        duplicateCount++;
        continue;
      }

      if (!activeRoleSet.has(u.role_id)) {
        invalidRoleCount++;
        continue;
      }

      seenEmailSet.add(emailKey);
      seenNameSet.add(nameKey);
      if (contactKey !== "") seenContactSet.add(contactKey);

      finalPayload.push({
        name: u.name,
        email: u.email,
        contact: u.contact, // Saves "" if empty
        password: await authService.hashPassword(u.password),
        role_id: u.role_id,
        account_status: "ACTIVE",
        created_by: req.user.name,
        updated_by: req.user.name
      });
    }

    /* ---------------- BULK CREATE ---------------- */
    let createdUsers = [];
    if (finalPayload.length) {
      createdUsers = await User.bulkCreate(finalPayload, {
        transaction,
        validate: true
      });
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: "Bulk user upload completed",
      summary: {
        total_received: input.length,
        created: createdUsers.length,
        empty_records: emptyCount,
        duplicates: duplicateCount,
        invalid_roles: invalidRoleCount,
        invalid_contacts: invalidContactCount // Added to summary
      },
      data: createdUsers.map(u => {
        const plainUser = u.get({ plain: true });
        delete plainUser.password;
        return plainUser;
      })
    });

  } catch (err) {
    if (transaction) await transaction.rollback();
    return handleError(err, next, "Bulk user creation failed");
  }
};
 
exports.search = async (req, res, next) => {
  try {
    if (!req.user) {
      return sendError(next, "Unauthorized", 401);
    }

    const {
      name,
      email,
      role_id,
      account_status,
      limit = 20,
      offset = 0
    } = req.query;

    if (isNaN(limit) || isNaN(offset)) {
      return sendError(next, "Invalid pagination parameters", 400);
    }

    if (account_status && !["ACTIVE", "INACTIVE"].includes(account_status)) {
      return sendError(next, "Invalid account_status", 400);
    }

    if (role_id && isNaN(role_id)) {
      return sendError(next, "Invalid role_id", 400);
    }

    const where = {};

    if (name) where.name = { [db.Sequelize.Op.like]: `%${name}%` };
    if (email) where.email = { [db.Sequelize.Op.like]: `%${email}%` };
    if (role_id) where.role_id = role_id;
    if (account_status) where.account_status = account_status;

    // Define the exclusion filter for the role
    const roleInclude = {
      model: Role,
      as: "role",
      where: {
        role_name: { [db.Sequelize.Op.ne]: 'Client User' }
      },
      required: true // This forces an INNER JOIN to filter out the users
    };

    const users = await User.findAll({
      where,
      include: [roleInclude],
      attributes: { exclude: ["password"] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["created_at", "DESC"]]
    });

    // Updated count to include the same role filter so pagination numbers are correct
    const total = await User.count({ 
      where,
      include: [roleInclude]
    });

    res.locals.data = {
      data: users.map(u => u.get({ plain: true })),
      total
    };

    next();

  } catch (error) {
    handleError(error, next, "User search failed");
  }
};
 
exports.update = async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { user_id } = req.params;

    // 1. Basic Authorization and Param Validation
    if (!req.user) {
      await transaction.rollback();
      return sendError(next, "Unauthorized", 401);
    }

    if (!Number.isInteger(Number(user_id))) {
      await transaction.rollback();
      return sendError(next, "Invalid user ID", 400);
    }

    // 2. Normalization & Restricted Fields
    // Prepare update object with trimmed strings
    const updates = {};
    const allowedFields = ["name", "email", "contact", "password", "role_id", "account_status"];
    
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = typeof req.body[key] === "string" ? req.body[key].trim() : req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      await transaction.rollback();
      return sendError(next, "No fields provided for update", 400);
    }

    // 3. Format Validations
    if (updates.contact) {
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(updates.contact)) {
        await transaction.rollback();
        return sendError(next, "Phone number must be exactly 10 numeric digits", 400);
      }
    }

    if (updates.account_status && !["ACTIVE", "INACTIVE"].includes(updates.account_status)) {
      await transaction.rollback();
      return sendError(next, "Invalid account status", 400);
    }

    // 4. Role Validation (Check if role is ACTIVE)
    if (updates.role_id) {
      const role = await Role.findOne({
        where: { 
          role_id: updates.role_id, 
          status: { [Op.ne]: "INACTIVE" } 
        }
      });
      if (!role) {
        await transaction.rollback();
        return sendError(next, "Selected role is invalid or inactive", 400);
      }
    }

    // 5. Uniqueness Checks (Excluding the current user)
    
    // Check Email Uniqueness
    if (updates.email) {
      const existingEmail = await User.findOne({
        where: { email: updates.email, user_id: { [Op.ne]: user_id } }
      });
      if (existingEmail) {
        await transaction.rollback();
        return sendError(next, "This email address is already in use by another account", 409);
      }
    }

    // Check Name Uniqueness
    if (updates.name) {
      const existingName = await User.findOne({
        where: { name: updates.name, user_id: { [Op.ne]: user_id } }
      });
      if (existingName) {
        await transaction.rollback();
        return sendError(next, "This user name already exists", 409);
      }
    }

    // CHECK CONTACT UNIQUENESS (Fixes your duplicate bug)
    if (updates.contact) {
      const existingContact = await User.findOne({
        where: { contact: updates.contact, user_id: { [Op.ne]: user_id } }
      });
      if (existingContact) {
        await transaction.rollback();
        return sendError(next, "This phone number is already registered to another user", 409);
      }
    }

    // 6. Final Processing & Execution
    if (updates.password) {
      updates.password = await authService.hashPassword(updates.password);
    }

    updates.updated_by = req.user.name; // Logging who updated the record

    const [affectedRows] = await User.update(updates, {
      where: { user_id },
      transaction
    });

    if (!affectedRows) {
      await transaction.rollback();
      return sendError(next, "User not found or no changes made", 404);
    }

    await transaction.commit();

    const updatedUser = await User.findByPk(user_id, {
      attributes: { exclude: ["password"] },
      include: [{ model: Role, as: "role", attributes: ["role_id", "role_name"] }]
    });

    res.locals.data = updatedUser ? updatedUser.get({ plain: true }) : { user_id, ...updates };
    next();

  } catch (error) {
    if (transaction) await transaction.rollback();
    handleError(error, next, "Internal server error while updating user");
  }
};