import jwt, { SignOptions  } from "jsonwebtoken";
import config from "@/config";
// import { JWTPayload, AccessTokenPayload } from '../types/user';
import {User, Permission, RefreshToken} from '@/database/models/index';


// export async function checkAccessToken(accessToken: string) {
//   try {
//     var r: any = await jwt.verify(accessToken, conf.secret);
//     return { data: r, error: null };
//   } catch (error) {
//     return { data: null, error };
//   }
// }

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}


export async function checkAccessToken(accessToken: string) {
  try {
    // Try to verify with the first secret
    const data = await jwt.verify(accessToken, config.jwt.accessSecret);
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

export async function checkRefreshToken(refreshToken: string) {
  try {
    // Try to verify with the first secret
    const data = await jwt.verify(refreshToken, config.jwt.refreshSecret);
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

export function generateAccessToken(user: User) {
  const rolesList = user.roles || {};
  const permissionsList: Permission[] = [];

  user.roles?.permissions?.forEach((permission) => {
      if (!permissionsList.includes(permission)) {
        permissionsList.push(permission);
      }
    });

  // Sign Access Token
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      roles: rolesList,
      permissions: permissionsList,
    },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiry as SignOptions["expiresIn"] }
  );
  return { accessToken };
}


export async function generateTokenPair(user: User): Promise<TokenPair> {
    // Collect role names and permission names
    const rolesList = user.roles || {};
    const permissionsList: Permission[] = [];

    user.roles?.permissions?.forEach((permission) => {
        if (!permissionsList.includes(permission)) {
          permissionsList.push(permission);
        }
      });

    // Sign Access Token
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        roles: rolesList,
        permissions: permissionsList,
      },
      config.jwt.accessSecret,
      { expiresIn: config.jwt.accessExpiry as SignOptions["expiresIn"] }
    );

    // Sign Refresh Token
    const refreshToken = jwt.sign(
      { id: user.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiry as SignOptions["expiresIn"] }
    );

    // Compute expiry date for refresh token
    const decodedRefresh = jwt.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decodedRefresh.exp * 1000);

    // Store refresh token in DB
    await RefreshToken.create({
      token: refreshToken,
      user_id: user.id,
      expires_at: expiresAt,
    });

    return { accessToken, refreshToken };
  }