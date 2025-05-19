import fetch from 'node-fetch';
import { MCPConfig, TokenData } from '../types/node';
import { AuthenticationError } from '../types/errors';
import { Cache } from '../utils/cache';

/**
 * Handles authentication with the Mew API using Auth0.
 */
export class AuthService {
  private tokenCache: Cache<string>;
  protected config: MCPConfig;

  constructor(config: MCPConfig) {
    this.config = config;
    this.tokenCache = new Cache<string>(4 * 60 * 1000); // 4 minutes TTL
  }

  /**
   * Retrieves or refreshes the Auth0 access token using client credentials.
   * @returns The fetched access token
   * @throws {AuthenticationError} If authentication fails
   */
  async getAccessToken(): Promise<string> {
    const cachedToken = this.tokenCache.get('auth_token');
    if (cachedToken) {
      return cachedToken;
    }

    try {
      const response = await fetch(
        `https://${this.config.auth0Domain}/oauth/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: this.config.auth0ClientId,
            client_secret: this.config.auth0ClientSecret,
            audience: this.config.auth0Audience,
            grant_type: 'client_credentials',
          }),
        }
      );

      if (!response.ok) {
        throw new AuthenticationError(
          `Auth failed: ${response.statusText}`,
          response.status,
          await response.text()
        );
      }

      const data = (await response.json()) as TokenData;
      this.tokenCache.set('auth_token', data.access_token);
      return data.access_token;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(
        `Failed to get access token: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Clears the token cache, forcing a new token to be fetched on the next request.
   */
  clearTokenCache(): void {
    this.tokenCache.clear();
  }
} 