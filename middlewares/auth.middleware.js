
const jwt = require("jsonwebtoken");
const { User, Role, Site } = require("../models");
const userConfig = require("../config/user.config");
const { sendError } = require("../functions/sendResponse");
const authService = require("../services/auth.service");


const getUser = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return sendError(next, "Name required", 401);

    const user = await User.findOne({
      where: { name },
      include: [
        {
          model: Role,
          as: "role",
          attributes: ["role_id", "role_name"],
        }
      ],
    });

    if (!user) return sendError(next, "Invalid name or user not found", 401);

    if (user.account_status === "INACTIVE") {
      return sendError(next, "User account is inactive. Contact Administrator.", 403);
    }

    req.foundUser = user;
    console.log(`📌 User fetched for login: ${user.name}`);
    next();
  } catch (err) {
    console.error("❌ getUser error:", err.message);
    return sendError(next, "Internal server error during authentication", 500);
  }
};


const matchPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) return sendError(next, "Password required", 401);

    const matched = await authService.comparePassword(
      password,
      req.foundUser.password
    );

    if (!matched) return sendError(next, "Invalid credentials", 401);

    console.log("✅ Password matched");
    next();
  } catch (err) {
    console.error("❌ matchPassword error:", err.message);
    return sendError(next, "Password verification failed", 500);
  }
};

const sign_in = (req, res, next) => {
  try {
    const user = req.foundUser;

    const token = jwt.sign(
      {
        userId: user.user_id,
        name: user.name,
        roleId: user.role.role_id,
        roleName: user.role.role_name,
      },
      userConfig.SECRET,
      { expiresIn: "8h" }
    );

    res.locals.data = {
      token,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };

    console.log("✅ JWT generated");
    next();
  } catch (err) {
    console.error("❌ sign_in error:", err.message);
    return sendError(next, "Login failed", 500);
  }
};


const loginRequired = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    

    if (!authHeader) return sendError(next, "Authorization header missing", 401);
    
    const token = authHeader.split(" ")[1];
    if (!token) return sendError(next, "Token missing", 401);


    const decoded = jwt.verify(token, userConfig.SECRET);


    const user = await User.findOne({
      where: { user_id: decoded.userId },
      attributes: ["user_id", "name", "email", "role_id", "account_status"],
      include: [
        {
          model: Role,
          as: "role",
          attributes: ["role_id", "role_name"]
        }
      ]
    });

    if (!user) return sendError(next, "Invalid session. Please login again.", 401);

    if (user.account_status === "INACTIVE") {
      return sendError(next, "Access denied. User is Inactive.", 403);
    }


    req.user = user.get({ plain: true });

    console.log(`✅ User ${user.name} authenticated via JWT`);
    next();
  } catch (err) {
    console.error("❌ loginRequired error:", err.message);
    return sendError(next, "Session expired or invalid token", 401);
  }
};

module.exports = {
  getUser,
  matchPassword,
  sign_in,
  loginRequired,
};