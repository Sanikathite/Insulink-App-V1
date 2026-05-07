const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { User, Role, LoginOtpChallenge } = require("../models");
const { sendError } = require("../functions/sendResponse");
const userConfig = require("../config/user.config");

const OTP_EXPIRY_MINUTES = Number.parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;
const OTP_MAX_ATTEMPTS = Number.parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5;
const OTP_DEFAULT_COUNTRY_CODE = process.env.OTP_DEFAULT_COUNTRY_CODE || "+91";
const OTP_REQUIRE_PROVIDER = process.env.OTP_REQUIRE_PROVIDER === "true";

const getTwilioConfig = () => ({
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID
});

const hasTwilioVerifyConfig = (cfg) => Boolean(cfg.accountSid && cfg.authToken && cfg.verifyServiceSid);

const getTwilioClient = (cfg) => {
  try {
    const twilio = require("twilio");
    return twilio(cfg.accountSid, cfg.authToken);
  } catch (_error) {
    return null;
  }
};

const normalizePhoneNumber = (rawContact) => {
  const contact = String(rawContact || "").trim();
  if (!contact) return null;

  if (contact.startsWith("+")) {
    const normalized = `+${contact.slice(1).replace(/\D/g, "")}`;
    return /^\+\d{10,15}$/.test(normalized) ? normalized : null;
  }

  const digitsOnly = contact.replace(/\D/g, "");

  if (digitsOnly.length === 10) {
    const normalized = `${OTP_DEFAULT_COUNTRY_CODE}${digitsOnly}`;
    return /^\+\d{10,15}$/.test(normalized) ? normalized : null;
  }

  if (digitsOnly.length >= 11 && digitsOnly.length <= 15) {
    const normalized = `+${digitsOnly}`;
    return /^\+\d{10,15}$/.test(normalized) ? normalized : null;
  }

  return null;
};

const issueSessionPayload = (user) => {
  const token = jwt.sign(
    {
      userId: user.user_id,
      name: user.name,
      roleId: user.role.role_id,
      roleName: user.role.role_name
    },
    userConfig.SECRET,
    { expiresIn: "8h" }
  );

  return {
    token,
    user: {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      account_status: user.account_status
    }
  };
};

exports.changePassword = async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;

    if (!req.user?.user_id) {
      return sendError(next, "Unauthorized", 401);
    }

    if (!old_password || !new_password) {
      return sendError(next, "old_password and new_password are required", 400);
    }

    const user = await User.findByPk(req.user.user_id);

    if (!user) {
      return sendError(next, "User not found", 404);
    }

    const isMatch = await bcrypt.compare(old_password, user.password);

    if (!isMatch) {
      return sendError(next, "Current password is incorrect", 400);
    }

    if (old_password === new_password) {
      return sendError(next, "New password cannot be the same as old password", 400);
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      data: null,
      message: "Password updated successfully"
    });

  } catch (error) {
    return sendError(next, "Server error", 500);
  }
};

exports.requestSignInOtp = async (req, res, next) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name || !password) {
      return sendError(next, "name and password are required", 400);
    }

    const user = await User.findOne({
      where: { name },
      include: [
        {
          model: Role,
          as: "role",
          attributes: ["role_id", "role_name"]
        }
      ]
    });

    if (!user) {
      return sendError(next, "Invalid credentials", 401);
    }

    if (user.account_status === "INACTIVE") {
      return sendError(next, "User account is inactive", 403);
    }

    const passwordMatched = await bcrypt.compare(password, user.password);
    if (!passwordMatched) {
      return sendError(next, "Invalid credentials", 401);
    }

    const phoneNumber = normalizePhoneNumber(user.contact);
    if (!phoneNumber) {
      return sendError(next, "Registered contact number is invalid for OTP", 400);
    }

    await LoginOtpChallenge.update(
      { status: "CANCELLED" },
      {
        where: {
          user_id: user.user_id,
          status: "PENDING"
        }
      }
    );

    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const twilioCfg = getTwilioConfig();

    let provider = "LOCAL_DEV";
    let providerSid = null;
    let otpHash = null;
    let debugOtp = null;

    if (hasTwilioVerifyConfig(twilioCfg)) {
      const twilioClient = getTwilioClient(twilioCfg);

      if (!twilioClient && OTP_REQUIRE_PROVIDER) {
        return sendError(next, "Twilio SDK is not available in this environment", 500);
      }

      if (twilioClient) {
        try {
          const verification = await twilioClient.verify.v2
            .services(twilioCfg.verifyServiceSid)
            .verifications.create({
              to: phoneNumber,
              channel: "sms"
            });

          provider = "TWILIO_VERIFY";
          providerSid = verification.sid;
        } catch (providerError) {
          if (OTP_REQUIRE_PROVIDER) {
            return sendError(next, "Failed to dispatch OTP via SMS provider", 502);
          }
        }
      }
    } else if (OTP_REQUIRE_PROVIDER) {
      return sendError(next, "OTP provider is not configured", 500);
    }

    if (provider === "LOCAL_DEV") {
      debugOtp = String(Math.floor(100000 + Math.random() * 900000));
      otpHash = await bcrypt.hash(debugOtp, 10);
    }

    await LoginOtpChallenge.create({
      challenge_id: challengeId,
      user_id: user.user_id,
      phone_number: phoneNumber,
      provider,
      provider_sid: providerSid,
      otp_hash: otpHash,
      attempt_count: 0,
      max_attempts: OTP_MAX_ATTEMPTS,
      status: "PENDING",
      expires_at: expiresAt
    });

    const data = {
      challenge_id: challengeId,
      expires_at: expiresAt.toISOString()
    };

    if (debugOtp && process.env.NODE_ENV !== "production") {
      data.debug_otp = debugOtp;
    }

    return res.status(200).json({
      success: true,
      data,
      message:
        provider === "TWILIO_VERIFY"
          ? "OTP sent to registered mobile number"
          : "OTP generated in local fallback mode"
    });
  } catch (error) {
    next(error);
  }
};

exports.verifySignInOtp = async (req, res, next) => {
  try {
    const challengeId =
      typeof req.body?.challenge_id === "string" ? req.body.challenge_id.trim() : "";
    const otpCode = typeof req.body?.otp_code === "string" ? req.body.otp_code.trim() : "";

    if (!challengeId || !otpCode) {
      return sendError(next, "challenge_id and otp_code are required", 400);
    }

    const challenge = await LoginOtpChallenge.findByPk(challengeId, {
      include: [
        {
          model: User,
          as: "user",
          include: [
            {
              model: Role,
              as: "role",
              attributes: ["role_id", "role_name"]
            }
          ]
        }
      ]
    });

    if (!challenge) {
      return sendError(next, "OTP challenge not found", 404);
    }

    if (challenge.status !== "PENDING") {
      return sendError(next, "OTP challenge is no longer active", 400);
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      await challenge.update({ status: "EXPIRED" });
      return sendError(next, "OTP has expired", 400);
    }

    if (challenge.attempt_count >= challenge.max_attempts) {
      await challenge.update({ status: "FAILED" });
      return sendError(next, "OTP verification locked due to too many failed attempts", 429);
    }

    const user = challenge.user;
    if (!user) {
      return sendError(next, "User not found for OTP challenge", 404);
    }

    if (user.account_status === "INACTIVE") {
      return sendError(next, "User account is inactive", 403);
    }

    let isVerified = false;

    if (challenge.provider === "TWILIO_VERIFY") {
      const twilioCfg = getTwilioConfig();

      if (!hasTwilioVerifyConfig(twilioCfg)) {
        return sendError(next, "OTP provider is not configured", 500);
      }

      const twilioClient = getTwilioClient(twilioCfg);
      if (!twilioClient) {
        return sendError(next, "Twilio SDK is not available in this environment", 500);
      }

      const verificationCheck = await twilioClient.verify.v2
        .services(twilioCfg.verifyServiceSid)
        .verificationChecks.create({
          to: challenge.phone_number,
          code: otpCode
        });

      isVerified = verificationCheck.status === "approved";
    } else {
      isVerified = await bcrypt.compare(otpCode, challenge.otp_hash || "");
    }

    if (!isVerified) {
      const nextAttemptCount = challenge.attempt_count + 1;
      const exceeded = nextAttemptCount >= challenge.max_attempts;

      await challenge.update({
        attempt_count: nextAttemptCount,
        status: exceeded ? "FAILED" : "PENDING"
      });

      return sendError(
        next,
        exceeded
          ? "OTP verification locked due to too many failed attempts"
          : "Invalid OTP",
        exceeded ? 429 : 400
      );
    }

    await challenge.update({
      attempt_count: challenge.attempt_count + 1,
      status: "VERIFIED",
      verified_at: new Date()
    });

    const sessionData = issueSessionPayload(user);

    return res.status(200).json({
      success: true,
      data: sessionData,
      message: "OTP verified and login successful"
    });
  } catch (error) {
    next(error);
  }
};