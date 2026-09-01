import { User, Role, Permission } from '@/database/models/index';
import { UserCreationAttributes } from '@/database/models/user.model';

export class UserRepository {
  /**
   * Find user by email including roles and permissions
   */
  static async findByEmail(email: string): Promise<User | null> {
    return User.findOne({
      where: { email},
      include: [
        {
          model: Role,
          as: 'roles',
          include: [
            {
              model: Permission,
              as: 'permissions',
            },
          ],
        },
      ],
    });
  }

  /**
   * Find user by ID including roles and permissions
   */
  static async findById(id: string | number): Promise<User | null> {
    return User.findOne({
      where: { id, is_active: true },
      include: [
        {
          model: Role,
          as: 'roles',
          include: [
            {
              model: Permission,
              as: 'permissions',
            },
          ],
        },
      ],
    });
  }

  /**
   * Create a new user in the database
   */
   static async create(userData: UserCreationAttributes): Promise<User> {
    return User.create(userData);
  }

  /**
   * Check if an email already exists in the system
   */
   static async existsEmail(email: string): Promise<boolean> {
    const count = await User.count({ where: { email } });
    return count > 0;
  }

  /**
   * Find user by reset password token
   */
  static async findByResetToken(token: string): Promise<User | null> {
    return User.findOne({
      where: {
        reset_password_token: token,
      },
      include: [
        {
          model: Role,
          as: 'roles',
          include: [
            {
              model: Permission,
              as: 'permissions',
            },
          ],
        },
      ],
    });
  }
}

