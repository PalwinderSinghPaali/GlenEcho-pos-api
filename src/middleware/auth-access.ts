import { Request, Response, NextFunction } from "express";
import { UserRepository } from '@/services/user';

interface AuthenticatedRequest extends Request {
    user?: any;
  }

const accessAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void | any> => {

    const user = await UserRepository.findById(req.user.id);

    if (user?.roles?.role === 'Admin' || user?.roles?.role === 'admin') {
       return next();
    }
    return res.sendError(res, 'ERR_ACCESS_DENIED');

};

export default accessAdmin;