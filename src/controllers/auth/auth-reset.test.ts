import { Request, Response } from 'express';
import { forgotPassword, resetPassword, updateProfile, logout, refreshAccess } from './index';
import { UserRepository } from '@/services/user';
import { mailService } from '@/services/mail';
import { RefreshToken, User } from '@/database/models';
import { checkRefreshToken, generateAccessToken } from '@/utils/auth';

jest.mock('@/services/user');
jest.mock('@/services/mail');
jest.mock('@/utils/logger');
jest.mock('@/database/models');
jest.mock('@/utils/auth');

describe('Auth Password Reset Controllers', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      sendSuccess: jest.fn(),
      sendError: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('forgotPassword', () => {
    it('should generate a token and send a reset email if user exists and is active', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        is_active: true,
        save: jest.fn().mockResolvedValue(true),
        reset_password_token: null as string | null,
        reset_password_expires: null as Date | null,
      };

      (UserRepository.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      (mailService.sendPasswordResetEmail as jest.Mock).mockResolvedValue(true);

      mockRequest.body = { email: 'test@example.com' };

      await forgotPassword(mockRequest as Request, mockResponse as Response);

      expect(UserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.reset_password_token).not.toBeNull();
      expect(mockUser.reset_password_expires).not.toBeNull();
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        mockUser.reset_password_token,
        'John'
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.any(String),
        })
      );
    });

    it('should return success even if user does not exist (to prevent email enumeration)', async () => {
      (UserRepository.findByEmail as jest.Mock).mockResolvedValue(null);

      mockRequest.body = { email: 'nonexistent@example.com' };

      await forgotPassword(mockRequest as Request, mockResponse as Response);

      expect(UserRepository.findByEmail).toHaveBeenCalledWith('nonexistent@example.com');
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.any(String),
        })
      );
    });

    it('should return error if user is inactive', async () => {
      const mockUser = {
        email: 'inactive@example.com',
        is_active: false,
      };

      (UserRepository.findByEmail as jest.Mock).mockResolvedValue(mockUser);

      mockRequest.body = { email: 'inactive@example.com' };

      await forgotPassword(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'ERR_AUTH_USER_NOT_ACTIVE');
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully if token is valid and not expired', async () => {
      const expires = new Date();
      expires.setHours(expires.getHours() + 1);

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        reset_password_token: 'valid-token',
        reset_password_expires: expires,
        password: 'old-password',
        save: jest.fn().mockResolvedValue(true),
      };

      (UserRepository.findByResetToken as jest.Mock).mockResolvedValue(mockUser);

      mockRequest.body = { token: 'valid-token', password: 'new-password' };

      await resetPassword(mockRequest as Request, mockResponse as Response);

      expect(UserRepository.findByResetToken).toHaveBeenCalledWith('valid-token');
      expect(mockUser.password).toBe('new-password');
      expect(mockUser.reset_password_token).toBeNull();
      expect(mockUser.reset_password_expires).toBeNull();
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.any(String),
        })
      );
    });

    it('should return error if reset token is invalid', async () => {
      (UserRepository.findByResetToken as jest.Mock).mockResolvedValue(null);

      mockRequest.body = { token: 'invalid-token', password: 'new-password' };

      await resetPassword(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'ERR_AUTH_RESET_TOKEN_INVALID');
    });

    it('should return error if reset token is expired', async () => {
      const expires = new Date();
      expires.setHours(expires.getHours() - 1); // Expired 1 hour ago

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        reset_password_token: 'expired-token',
        reset_password_expires: expires,
        save: jest.fn(),
      };

      (UserRepository.findByResetToken as jest.Mock).mockResolvedValue(mockUser);

      mockRequest.body = { token: 'expired-token', password: 'new-password' };

      await resetPassword(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'ERR_AUTH_RESET_TOKEN_EXPIRED');
      expect(mockUser.save).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully when authenticated and email is not changed', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        save: jest.fn().mockResolvedValue(true),
        toJSON: jest.fn().mockReturnValue({ id: 1, email: 'test@example.com', first_name: 'Johnny', last_name: 'Doe' }),
      };

      (UserRepository.findById as jest.Mock).mockResolvedValue(mockUser);

      mockRequest.user = { id: 1 } as any;
      mockRequest.body = { firstName: 'Johnny' };

      await updateProfile(mockRequest as Request, mockResponse as Response);

      expect(UserRepository.findById).toHaveBeenCalledWith(1);
      expect(mockUser.first_name).toBe('Johnny');
      expect(mockUser.last_name).toBe('Doe');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: 'Profile updated successfully.',
          user: expect.any(Object),
        })
      );
    });

    it('should update email successfully if the new email is not already in use', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_email_verified: true,
        save: jest.fn().mockResolvedValue(true),
        toJSON: jest.fn().mockReturnValue({ id: 1, email: 'new@example.com', first_name: 'John', last_name: 'Doe', is_email_verified: false }),
      };

      (UserRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (UserRepository.existsEmail as jest.Mock).mockResolvedValue(false);

      mockRequest.user = { id: 1 } as any;
      mockRequest.body = { email: 'new@example.com' };

      await updateProfile(mockRequest as Request, mockResponse as Response);

      expect(UserRepository.findById).toHaveBeenCalledWith(1);
      expect(UserRepository.existsEmail).toHaveBeenCalledWith('new@example.com');
      expect(mockUser.email).toBe('new@example.com');
      expect(mockUser.is_email_verified).toBe(false);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: 'Profile updated successfully.',
          user: expect.any(Object),
        })
      );
    });

    it('should return error if the new email is already in use by another user', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        save: jest.fn(),
      };

      (UserRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (UserRepository.existsEmail as jest.Mock).mockResolvedValue(true);

      mockRequest.user = { id: 1 } as any;
      mockRequest.body = { email: 'existing@example.com' };

      await updateProfile(mockRequest as Request, mockResponse as Response);

      expect(UserRepository.existsEmail).toHaveBeenCalledWith('existing@example.com');
      expect(mockUser.save).not.toHaveBeenCalled();
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'ERR_AUTH_USERNAME_OR_EMAIL_ALREADY_EXIST');
    });

    it('should return 401 unauthorized if req.user is missing', async () => {
      mockRequest.user = undefined;
      mockRequest.body = { firstName: 'Johnny' };

      // Mock status to chain json method
      const mockJson = jest.fn();
      mockResponse.status = jest.fn().mockReturnValue({ json: mockJson });

      await updateProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'ERR_UNAUTHORIZED',
          }),
        })
      );
    });

    it('should update password successfully if old password is valid', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password: 'old-password-hash',
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
        toJSON: jest.fn().mockReturnValue({ id: 1, email: 'test@example.com', first_name: 'John', last_name: 'Doe' }),
      };

      (UserRepository.findById as jest.Mock).mockResolvedValue(mockUser);

      mockRequest.user = { id: 1 } as any;
      mockRequest.body = { oldPassword: 'old-password', newPassword: 'new-password' };

      await updateProfile(mockRequest as Request, mockResponse as Response);

      expect(UserRepository.findById).toHaveBeenCalledWith(1);
      expect(mockUser.comparePassword).toHaveBeenCalledWith('old-password');
      expect(mockUser.password).toBe('new-password');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: 'Profile updated successfully.',
        })
      );
    });

    it('should return error if old password is invalid', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        comparePassword: jest.fn().mockResolvedValue(false),
        save: jest.fn(),
      };

      (UserRepository.findById as jest.Mock).mockResolvedValue(mockUser);

      mockRequest.user = { id: 1 } as any;
      mockRequest.body = { oldPassword: 'wrong-old-password', newPassword: 'new-password' };

      await updateProfile(mockRequest as Request, mockResponse as Response);

      expect(mockUser.comparePassword).toHaveBeenCalledWith('wrong-old-password');
      expect(mockUser.save).not.toHaveBeenCalled();
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'ERR_AUTH_WRONG_PASSWORD');
    });
  });

  describe('logout', () => {
    it('should revoke the refresh token and clear the cookie', async () => {
      const mockDbToken = {
        user_id: 1,
        is_revoked: false,
        save: jest.fn().mockResolvedValue(true),
      };

      (RefreshToken.findOne as jest.Mock).mockResolvedValue(mockDbToken);

      mockRequest.cookies = { RID: 'valid-refresh-token' };
      mockResponse.clearCookie = jest.fn();

      await logout(mockRequest as Request, mockResponse as Response);

      expect(RefreshToken.findOne).toHaveBeenCalledWith({ where: { token: 'valid-refresh-token' } });
      expect(mockDbToken.is_revoked).toBe(true);
      expect(mockDbToken.save).toHaveBeenCalled();
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('RID', expect.any(Object));
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({ message: 'Logged out successfully' }),
        200
      );
    });

    it('should run successfully even if cookies and body are undefined', async () => {
      mockRequest.cookies = undefined;
      mockRequest.body = undefined;
      mockResponse.clearCookie = jest.fn();

      await logout(mockRequest as Request, mockResponse as Response);

      expect(RefreshToken.findOne).not.toHaveBeenCalled();
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('RID', expect.any(Object));
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({ message: 'Logged out successfully' }),
        200
      );
    });

    it('should revoke the refresh token if provided in req.body.refreshToken', async () => {
      const mockDbToken = {
        user_id: 1,
        is_revoked: false,
        save: jest.fn().mockResolvedValue(true),
      };

      (RefreshToken.findOne as jest.Mock).mockResolvedValue(mockDbToken);

      mockRequest.cookies = undefined;
      mockRequest.body = { RID: 'body-refresh-token' };
      mockResponse.clearCookie = jest.fn();

      await logout(mockRequest as Request, mockResponse as Response);

      expect(RefreshToken.findOne).toHaveBeenCalledWith({ where: { token: 'body-refresh-token' } });
      expect(mockDbToken.is_revoked).toBe(true);
      expect(mockDbToken.save).toHaveBeenCalled();
    });
  });

  describe('refreshAccess', () => {
    it('should return a new access token when a valid refresh token is provided', async () => {
      const mockUser = { id: 1, email: 'test@example.com' };
      const mockDbToken = {
        user_id: 1,
        token: 'valid-refresh-token',
        is_revoked: false,
        save: jest.fn(),
      };

      (RefreshToken.findOne as jest.Mock).mockResolvedValue(mockDbToken);
      (checkRefreshToken as jest.Mock).mockResolvedValue({ error: null });
      (UserRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (generateAccessToken as jest.Mock).mockReturnValue({ accessToken: 'new-access-token' });

      mockRequest.cookies = { RID: 'valid-refresh-token' };

      await refreshAccess(mockRequest as Request, mockResponse as Response);

      expect(RefreshToken.findOne).toHaveBeenCalledWith({
        where: { token: 'valid-refresh-token' },
        include: [{ model: User, as: 'user' }],
      });
      expect(checkRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(UserRepository.findById).toHaveBeenCalledWith(1);
      expect(generateAccessToken).toHaveBeenCalledWith(mockUser);
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        { accessToken: 'new-access-token' },
        200
      );
    });

    it('should return error if cookies and body are undefined', async () => {
      mockRequest.cookies = undefined;
      mockRequest.body = undefined;

      await refreshAccess(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'ERR_AUTH_REFRESH_EXPIRED');
    });

    it('should return a new access token when a valid refresh token is provided in req.body.refreshToken', async () => {
      const mockUser = { id: 1, email: 'test@example.com' };
      const mockDbToken = {
        user_id: 1,
        token: 'body-refresh-token',
        is_revoked: false,
        save: jest.fn(),
      };

      (RefreshToken.findOne as jest.Mock).mockResolvedValue(mockDbToken);
      (checkRefreshToken as jest.Mock).mockResolvedValue({ error: null });
      (UserRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (generateAccessToken as jest.Mock).mockReturnValue({ accessToken: 'new-access-token' });

      mockRequest.cookies = undefined;
      mockRequest.body = { RID: 'body-refresh-token' };

      await refreshAccess(mockRequest as Request, mockResponse as Response);

      expect(RefreshToken.findOne).toHaveBeenCalledWith({
        where: { token: 'body-refresh-token' },
        include: [{ model: User, as: 'user' }],
      });
      expect(checkRefreshToken).toHaveBeenCalledWith('body-refresh-token');
      expect(UserRepository.findById).toHaveBeenCalledWith(1);
      expect(generateAccessToken).toHaveBeenCalledWith(mockUser);
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        { accessToken: 'new-access-token' },
        200
      );
    });
  });
});
