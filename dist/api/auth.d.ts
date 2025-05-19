import { MCPConfig } from '../types/node';
/**
 * Handles authentication with the Mew API using Auth0.
 */
export declare class AuthService {
    private tokenCache;
    protected config: MCPConfig;
    constructor(config: MCPConfig);
    /**
     * Retrieves or refreshes the Auth0 access token using client credentials.
     * @returns The fetched access token
     * @throws {AuthenticationError} If authentication fails
     */
    getAccessToken(): Promise<string>;
    /**
     * Clears the token cache, forcing a new token to be fetched on the next request.
     */
    clearTokenCache(): void;
}
