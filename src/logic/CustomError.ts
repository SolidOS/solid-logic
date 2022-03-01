class CustomError extends Error {
    constructor(message?: string) {
        super(message);
        // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
        this.name = new.target.name; // stack traces display correctly now
    }
}
    
export class UnauthorizedError extends CustomError {}

export class CrossOriginForbiddenError extends CustomError {}

export class SameOriginForbiddenError extends CustomError {}

export class NotFoundError extends CustomError {}

export class FetchError extends CustomError {
    status: number;

    constructor(status: number, message?: string) {
        super(message);
        this.status = status;
    }
}