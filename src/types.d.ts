declare module "mongodb";

export {};

declare global {
  namespace Express {
    interface Request {
      user: JWTPayload | string;
    }
  }
}
