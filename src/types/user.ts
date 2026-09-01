export interface UserAuthPayload {
  id: number;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  isActive: boolean;
  role: 'admin' | 'user' | 'manager';
  createdAt: Date;
  updatedAt: Date;
}

export interface JWTPayload {
  id: number;
  role: string;
}

export interface AccessTokenPayload {
  user: {
    id: number;
    role: string;
  };
}


export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface UpdateUserRequest {
  id: number;
  email: string;
  password?: string | null;
  firstName: string;
  lastName: string;
}


export interface FetchUsersQuery {
  id?: string | number;
  search?: string;
  pagination?: 'true' | 'false';
  page?: string;
  limit?: string;
}