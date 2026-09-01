import { Request, Response } from "express";
import { Sequelize, Op } from "sequelize";
import { Permission, Role, User } from "@/database/models";

//create user role
const createUserRole = async (req: Request, res: Response) => {
    try {
        let roleExist = await Role.findOne({ where: { role: req.body.role } });
        if (roleExist) {
            return res.sendError(res, "Role is already exist");
        }
        const data = {
            role: req.body.role
        };
        const role = await Role.create(data);
        if (role) {
            const menuData = req.body.permissions?.map((obj: any) => {
                return {
                    role_id: role?.dataValues?.id,
                    menu: obj.menu,
                    create: obj.create,
                    view: obj.view,
                    edit: obj.edit,
                    delete: obj.delete,
                };
            })
            let permissions
            if (menuData.length > 0) {
                permissions = await Permission.bulkCreate(menuData);
            }

            res.sendSuccess(res, { role, permissions });
        }
    } catch (error: any) {
        console.error(error);
        return res.sendError(res, error.message);
    }
}

const checkRoleExists = async (req: Request, res: Response) => {
    try {
        let whereCondition = {}
        if (req.body.roleId) {
            whereCondition = { role: { [Op.iLike]: req.body.role }, id: { [Op.ne]: req.body.roleId } }
        } else {
            whereCondition = { role: { [Op.iLike]: req.body.role } }
        }

        let role = await Role.findOne({ where: whereCondition })

        return res.sendSuccess(res, role ? { exist: true } : { exist: false })

    } catch (error: any) {
        console.error(error);
        return res.sendError(res, error.message);
    }
}

//get user roles
const getUserRoles = async (req: Request, res: Response) => {
    const searchTerm = req.query.search || '';
    const sortOrder = req.query.sort || 'desc';
    //   const sortField = req.query.sortBy || ''; 
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const whereCondition: any = {}
    try {
        if (searchTerm) {
            whereCondition[Op.or] = [
                { role: { [Op.iLike]: `%${searchTerm}%` } }, // Search by crop Type 
            ];
        }

        const queryOptions: any = {
            where: whereCondition,
        };

        if (sortOrder === 'asc' || sortOrder === 'desc') {
            queryOptions.order = [['id', sortOrder]];
        }
        //fetch data with pagination
        if (req.query.pagination === "true") {
            queryOptions.offset = offset;
            queryOptions.limit = limit;

            const { count, rows } = await Role.findAndCountAll(queryOptions);
            return res.sendPaginationSuccess(res, rows, count);
        } else {
            const userrole = await Role.findAll(queryOptions);
            return res.sendSuccess(res, userrole, 200);
        }
    } catch (error: any) {
        console.error(error);
        return res.sendError(res, error.message);
    }
}

const getUserRole = async (req: Request, res: Response) => {
  try {
    const roleId = Number(req.query.id);

    if (isNaN(roleId)) {
      return res.sendError(res, "Invalid role id");
    }

    const role = await Role.findOne({
      where: { id: roleId },
    });

    const privileges = await Permission.findAll({
      where: {
        role_id: roleId,
      },
    });

    return res.sendSuccess(res, { role, privileges });
  } catch (error: any) {
    console.error(error);
    return res.sendError(res, error.message);
  }
};

const updateUserRole = async (req: Request, res: Response) => {
    try {
        let roleExist = await Role.findOne({ where: { role: { [Op.iLike]: req.body.role }, id: { [Op.ne]: req.body.id } } });
        if (roleExist) {
            return res.sendError(res, "Role already exist with another id");
        }
        
        const roleId = req.body.id;
        const updatedData = {
            role: req.body.role
        };



        for await (const permission of req.body.permissions) {
            const existingpermission = await Permission.findOne({
                where: {
                    role_id: roleId,
                    menu: permission.menu,
                },
            });

            if (existingpermission) {
                if(!permission.create && !permission.view && !permission.edit && !permission.delete){
                    await Permission.destroy({ where: { id: existingpermission.id } })
                }else{
                    await Permission.update({
                    role_id: roleId,
                    menu: permission.menu,
                    create: permission.create,
                    view: permission.view,
                    edit: permission.edit,
                    delete: permission.delete,
                    }, {
                    where: { id: existingpermission.id }
                    });

                }
            } else {
                await Permission.create({
                    role_id: roleId,
                    menu: permission.menu,
                    create: permission.create,
                    view: permission.view,
                    edit: permission.edit,
                    delete: permission.delete,
                })
            }
        }
        const rowsUpdated = await
            Role.update(updatedData, {
                where: { id: roleId },
                returning: true,
            })
        if (rowsUpdated && rowsUpdated[0] === 0) {
            return res.sendError(res, "ERR_ROLE_NOT_FOUND");
        }

        return res.sendSuccess(res, rowsUpdated);
    } catch (error: any) {
        console.error(error);
        return res.sendError(res, error.message);
    }
}


const deleteUserRole = async (req: Request, res: Response) => {
    try {
        let count = await User.count({ where: { role: req.body.id } })
        if (count > 0) {
            return res.sendError(res, 'Not possible to delete this role since some users are associated to this role.')
        }

        const deletedCount = await Role.destroy({
            where: {
                id: req.body.id
            }
        });
        if (deletedCount === 0) {
            return res.sendError(res, "ERR_ROLE_NOT_FOUND");
        }

        return res.sendSuccess(res, {message: "Role Deleted Successfully"});
    } catch (error: any) {
        return res.sendError(res, error.message);
    }
}


export { createUserRole, getUserRoles, getUserRole, updateUserRole, deleteUserRole, checkRoleExists }