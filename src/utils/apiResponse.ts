interface ApiResponseStructure<T = any> {
    success: boolean;
    message: string;
    data?: T;
    errors?: string[] | string;
    statusCode: number;
    timestamp?: string;
  }
  
  export class ApiResponse {
    /**
     * Create a successful API response
     * @param data - The data to return
     * @param message - Success message
     * @param statusCode - HTTP status code (default: 200)
     * @returns Formatted success response
     */
    static success<T>(
      data?: T, 
      message: string = 'Operation completed successfully', 
      statusCode: number = 200
    ): ApiResponseStructure<T> {
      return {
        success: true,
        message,
        data,
        statusCode,
        timestamp: new Date().toISOString()
      };
    }
  
    /**
     * Create an error API response
     * @param message - Error message
     * @param statusCode - HTTP status code (default: 500)
     * @param errors - Additional error details
     * @returns Formatted error response
     */
    static error(
      message: string = 'An error occurred',
      statusCode: number = 500,
      errors?: string[] | string
    ): ApiResponseStructure {
      return {
        success: false,
        message,
        errors,
        statusCode,
        timestamp: new Date().toISOString()
      };
    }
  
    /**
     * Create a validation error response
     * @param errors - Validation error details
     * @param message - Error message
     * @returns Formatted validation error response
     */
    static validationError(
      errors: string[] | string,
      message: string = 'Validation failed'
    ): ApiResponseStructure {
      return {
        success: false,
        message,
        errors,
        statusCode: 400,
        timestamp: new Date().toISOString()
      };
    }
  
    /**
     * Create a not found error response
     * @param message - Not found message
     * @returns Formatted not found response
     */
    static notFound(message: string = 'Resource not found'): ApiResponseStructure {
      return {
        success: false,
        message,
        statusCode: 404,
        timestamp: new Date().toISOString()
      };
    }
  
    /**
     * Create an unauthorized error response
     * @param message - Unauthorized message
     * @returns Formatted unauthorized response
     */
    static unauthorized(message: string = 'Unauthorized access'): ApiResponseStructure {
      return {
        success: false,
        message,
        statusCode: 401,
        timestamp: new Date().toISOString()
      };
    }
  
    /**
     * Create a forbidden error response
     * @param message - Forbidden message
     * @returns Formatted forbidden response
     */
    static forbidden(message: string = 'Access forbidden'): ApiResponseStructure {
      return {
        success: false,
        message,
        statusCode: 403,
        timestamp: new Date().toISOString()
      };
    }
  
    /**
     * Create a conflict error response
     * @param message - Conflict message
     * @returns Formatted conflict response
     */
    static conflict(message: string = 'Resource conflict'): ApiResponseStructure {
      return {
        success: false,
        message,
        statusCode: 409,
        timestamp: new Date().toISOString()
      };
    }
  
    /**
     * Create a created response
     * @param data - The created resource data
     * @param message - Success message
     * @returns Formatted created response
     */
    static created<T>(
      data?: T,
      message: string = 'Resource created successfully'
    ): ApiResponseStructure<T> {
      return {
        success: true,
        message,
        data,
        statusCode: 201,
        timestamp: new Date().toISOString()
      };
    }
  
    /**
     * Create a no content response
     * @param message - Success message
     * @returns Formatted no content response
     */
    static noContent(message: string = 'Operation completed successfully'): ApiResponseStructure {
      return {
        success: true,
        message,
        statusCode: 204,
        timestamp: new Date().toISOString()
      };
    }
  }