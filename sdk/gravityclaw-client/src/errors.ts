export class GravityClawError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = "GravityClawError";
    }
}
