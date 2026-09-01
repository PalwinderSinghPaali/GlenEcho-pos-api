import winston from "winston";
import 'winston-daily-rotate-file';
const path = require('path');

// Define custom log formats
const logFormat = winston.format.printf(({ timestamp, level, message, stack, meta }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message || stack} ${
        meta ? JSON.stringify(meta) : ''
    }`;
});

// Create the log directory structure
const createLogDir = (dir: any) => {
    const fs = require('fs');
    // const logDir = path.join(__dirname, 'logs', dir);
    const logDir = path.join(process.cwd(), 'logs', dir);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
};

// Ensure directories for logs are created
['combined', 'errors', 'exceptions', 'rejections'].forEach(createLogDir);

// Log rotation configuration for each log type
const dailyRotateFileTransport = (folder: string, filename: string) =>
    new winston.transports.DailyRotateFile({
        filename: path.join(process.cwd(), 'logs', folder, filename),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true, // Compress old logs
        maxSize: '20m', // Rotate when file size exceeds 20MB
        maxFiles: '14d', // Keep logs for 14 days
    });

// Create Winston logger
const logger = winston.createLogger({
    level: 'info', // Default log level
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }), // Capture stack traces for errors
        logFormat
    ),
    transports: [
        // Combined log (info, warn, error)
        dailyRotateFileTransport('combined', 'combined-%DATE%.log'),

        // Error log (only errors)
        new winston.transports.DailyRotateFile({
            filename: path.join(process.cwd(), 'logs', 'errors', 'errors-%DATE%.log'),
            level: 'error', // Only capture errors
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
        }),

        // Console log for debugging
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
    ],
    exceptionHandlers: [
        // Separate log file for exceptions
        dailyRotateFileTransport('exceptions', 'exceptions-%DATE%.log'),
    ],
    rejectionHandlers: [
        // Separate log file for unhandled promise rejections
        dailyRotateFileTransport('rejections', 'rejections-%DATE%.log'),
    ],
});

export default logger;