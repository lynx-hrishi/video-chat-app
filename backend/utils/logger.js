export const loggerMiddleware = (req, res, next) => {
    // console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
    console.log(`\n[INFO] ${req.method} ${req.originalUrl}- IP: ${req.ip}`);
    next();
}