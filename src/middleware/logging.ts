import morgan from 'morgan';
import logger from '@/utils/logger';
import {Request, Response } from 'express';

// Customize Morgan tokens and format
// morgan.token('id', (req) => req.id || 'N/A'); // Example: Request ID
// morgan.token('user', (req) => req.user?.id || 'Guest'); // Example: User ID
// morgan.token('errorMessage', (req, res) => (res as Response).errorMessage || '');

// Create a Morgan middleware
// const morganMiddleware = morgan(
//     ':method :url :status :response-time ms - :res[content-length] bytes Error: :errorMessage',
//     {
//         stream: {
//             write: (message) => {
//                 logger.info(message.trim()); // Pipe logs to Winston
//             },
//         },
//     }
// );

const logging = morgan((tokens: any, req: Request, res: Response) => {
    const status = tokens.status(req, res);
    const message = [
      tokens.method(req, res),
      tokens.url(req, res),
      status,
      `${tokens['response-time'](req, res)} ms`,
      '-',
      `${tokens.res(req, res, 'content-length') || 0} bytes`,
      res.errorMessage ? `Error: ${res.errorMessage}` : '',
    ].join(' ');
  
    if (status >= 400) {
        logger.error(message.trim());
    } else {
        logger.info(message.trim());
    }
    return null
  });

export default logging;