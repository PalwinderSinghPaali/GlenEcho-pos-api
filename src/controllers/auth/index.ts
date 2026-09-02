import { Request, Response } from "express";
import crypto from 'crypto';

import {  generateTokenPair, checkRefreshToken, generateAccessToken } from "@/utils/auth";
import { UserRepository } from '@/services/user';
import config from '@/config';
import { RefreshToken, Role, User } from "@/database/models";
import logger from "@/utils/logger";
import { mailService } from '@/services/mail';


const login = async (req: Request, res: Response) => {
  try {
    const user = await UserRepository.findByEmail(req.body.email);
    if (!user) {
      return res.sendError(res, "ERR_AUTH_WRONG_EMAIL");
    }
    let activeUser = user.is_active ;
    if (!activeUser) { 
      return res.sendError(res, "ERR_AUTH_USER_NOT_ACTIVE"); 
    };

    // Check password
    
    if (user) {
      const verifyPassword = await user.comparePassword(req.body.password);
      if (!verifyPassword) { return res.sendError(res, "ERR_AUTH_WRONG_PASSWORD"); };

      var { accessToken, refreshToken } = await generateTokenPair(user);

      res.cookie('RID', refreshToken, {
        httpOnly: true,
        secure: config.app.cookie.secure,
        sameSite: config.app.cookie.sameSite,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days matching JWT_REFRESH_EXPIRY
      });

      const userJson = user.toJSON();
      delete userJson.password;

      return res.sendSuccess(res, {
        accessToken, user: userJson
      });
    }
  } catch (error) {
    console.log(error)
    return res.sendError(res, "ERR_AUTH_WRONG_USERNAME_OR_PASSWORD");
  }
}

const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName } = req.body
    const user = await UserRepository.findByEmail(req.body.email);

    if (user) {
      return res.sendError(res, "ERR_AUTH_USERNAME_OR_EMAIL_ALREADY_EXIST");
    }

    let role = await Role.findOne({ where: { role: 'User' }, raw: true });

    if(!role){
        return res.sendError(res, "UNABLE TO FOUND ANY USER ROLE");
    }


    const data = {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role: role.id,
      is_active: true
    }

    const userData = await UserRepository.create(data);
    
    if (userData) {
      const newUser = await UserRepository.findById(userData.id)
      if(!newUser){
        return res.sendError(res, "ERR_AUTH_REGISTER_FAILED_OR_NOT_FOUND");
      }
      var { accessToken, refreshToken } = await generateTokenPair(newUser);

      res.cookie('RID', refreshToken, {
        httpOnly: true,
        secure: config.app.cookie.secure,
        sameSite: config.app.cookie.sameSite,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days matching JWT_REFRESH_EXPIRY
      });

      const userJson = newUser.toJSON();
      delete userJson.password;

      return res.sendSuccess(res, {
        accessToken, user: userJson
      });
    }
  } catch (error) {
    console.log(error)
    return res.sendError(res, "ERR_AUTH_REGISTER_FAILED");
  }
}

const refreshAccess = async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.RID || req.body?.RID;
    if(!refreshToken){return res.sendError(res, "ERR_AUTH_REFRESH_EXPIRED")};
    
    try {

      const dbToken = await RefreshToken.findOne({
        where: { token: refreshToken },
        include: [{ model: User, as: 'user' }],
      });

      if (!dbToken) {
        return res.sendError(res, "ERR_AUTH_WRONG_REFRESH_TOKEN")
      }

      const userId = dbToken.user_id;

      if (dbToken.is_revoked) {
        logger.warn(`SECURITY ALERT: Revoked refresh token reused by User ID=${userId}. Revoking all sessions.`);
        
        // Revoke all tokens for this user immediately (breach recovery)
        await RefreshToken.update(
          { is_revoked: true },
          { where: { user_id: userId } }
        );
        
        return res.sendError(res, "ERR_AUTH_WRONG_REFRESH_TOKEN")
      }

      const { error }: any = await checkRefreshToken(refreshToken);

      if (error) {
          await RefreshToken.update(
            { is_revoked: true },
            { where: { user_id: userId, token: refreshToken } }
          );

          switch (error.name) {
          case "JsonWebTokenError":
              return res.sendError(res, "ERR_AUTH_WRONG_REFRESH_TOKEN");
          case "TokenExpiredError":
              return res.sendError(res, "ERR_AUTH_REFRESH_EXPIRED");
          default:
              return res.sendError(res, "ERR_AUTH_WRONG_REFRESH_TOKEN");
          }
      }
    
      const user = await UserRepository.findById(userId);
      if(!user){
        return res.sendError(res, "ERR_AUTH_USER_NOT_FOUND");
      }
      var {accessToken} =  generateAccessToken(user);
      if (!accessToken) {
          return res.sendError(res, "ERR_AUTH_WRONG_REFRESH_TOKEN");
      } 
      return res.sendSuccess(res, { accessToken}, 200);
    } catch (error: any) {
        console.error(error);
        return res.sendError(res, error.message); 
    }
  };

  const logout = async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.RID || req.body?.RID;
    console.log("Logout request received. Refresh Token:", refreshToken);
    if(refreshToken){
      const dbToken = await RefreshToken.findOne({ where: { token: refreshToken } });
      if (dbToken) {
        dbToken.is_revoked = true;
        await dbToken.save();
        logger.info(`Refresh token revoked for User ID=${dbToken?.user_id}`);
      }
    }

    res.clearCookie("RID", {
        httpOnly: true,
        secure: config.app.cookie.secure,
        sameSite: config.app.cookie.sameSite,
      });
    return res.sendSuccess(res, { message: 'Logged out successfully' }, 200);
  };

  const forgotPassword = async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const user = await UserRepository.findByEmail(email);

      if (!user) {
        // Return success to prevent enumeration, but log the event
        logger.info(`Forgot password request for non-existent email: ${email}`);
        return res.sendSuccess(res, { message: "If the email is associated with an account, a reset link has been sent." });
      }

      let activeUser = user.is_active;
      if (!activeUser) {
        return res.sendError(res, "ERR_AUTH_USER_NOT_ACTIVE");
      }

      // Generate a secure, random token (32 bytes hex)
      const token = crypto.randomBytes(32).toString('hex');
      
      // Set token expiration (e.g., 1 hour from now)
      const expires = new Date();
      expires.setHours(expires.getHours() + 1);

      user.reset_password_token = token;
      user.reset_password_expires = expires;
      await user.save();

      // Send email
      const emailSent = await mailService.sendPasswordResetEmail(user.email, token, user.first_name);

      if (!emailSent) {
        return res.sendError(res, "ERR_EMAIL_SEND_FAILED");
      }

      return res.sendSuccess(res, { message: "If the email is associated with an account, a reset link has been sent." });
    } catch (error: any) {
      logger.error('Forgot password error:', error);
      return res.sendError(res, error.message || "ERR_AUTH_FORGOT_PASSWORD_FAILED");
    }
  };

  const resetPassword = async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;

      const user = await UserRepository.findByResetToken(token);

      if (!user) {
        return res.sendError(res, "ERR_AUTH_RESET_TOKEN_INVALID");
      }

      // Check token expiration
      if (!user.reset_password_expires || new Date() > user.reset_password_expires) {
        return res.sendError(res, "ERR_AUTH_RESET_TOKEN_EXPIRED");
      }

      // Set new password (the model hook beforeUpdate handles hashing!)
      user.password = password;
      
      // Clear reset token and expiration
      user.reset_password_token = null;
      user.reset_password_expires = null;
      
      await user.save();

      return res.sendSuccess(res, { message: "Password has been reset successfully." });
    } catch (error: any) {
      logger.error('Reset password error:', error);
      return res.sendError(res, error.message || "ERR_AUTH_RESET_PASSWORD_FAILED");
    }
  };

  const updateProfile = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: { code: "ERR_UNAUTHORIZED", message: "User not authenticated" } });
      }

      const user = await UserRepository.findById(userId);
      if (!user) {
        return res.sendError(res, "ERR_AUTH_USER_NOT_FOUND");
      }

      const { firstName, lastName, email, oldPassword, newPassword } = req.body;

      if (email && email.toLowerCase() !== user.email.toLowerCase()) {
        // Check if new email is already in use
        const emailExists = await UserRepository.existsEmail(email);
        if (emailExists) {
          return res.sendError(res, "ERR_AUTH_USERNAME_OR_EMAIL_ALREADY_EXIST");
        }
        user.email = email;
        user.is_email_verified = false; // Reset verification status if email changes
      }

      if (firstName !== undefined) {
        user.first_name = firstName;
      }
      
      if (lastName !== undefined) {
        user.last_name = lastName;
      }

      if (newPassword !== undefined) {
        const isMatch = await user.comparePassword(oldPassword);
        if (!isMatch) {
          return res.sendError(res, "ERR_AUTH_WRONG_PASSWORD");
        }
        user.password = newPassword;
      }

      await user.save();

      // Do not return password hash
      const userJson = user.toJSON();
      delete userJson.password;

      return res.sendSuccess(res, {
        message: "Profile updated successfully.",
        user: userJson
      });
    } catch (error: any) {
      logger.error('Update profile error:', error);
      return res.sendError(res, error.message || "ERR_PROFILE_UPDATE_FAILED");
    }
  };
  

export {login, register, refreshAccess, logout, forgotPassword, resetPassword, updateProfile};

