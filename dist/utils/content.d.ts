import { ContentBlock } from '../types/node';
/**
 * Formats various input content types into the structured array format
 * expected by the Mew API's `node.content` field.
 * @param content The input content (string, object, or already formatted array)
 * @returns The formatted content array
 */
export declare function createNodeContent(content: any): ContentBlock[];
/**
 * Extracts the text value from a simple Mew text node's content array.
 * @param node The Mew GraphNode to extract text from
 * @returns The text value or null if not found/applicable
 */
export declare function getNodeTextContent(node: any): string | null;
/**
 * Normalizes a value for comparison by trimming whitespace and converting to lowercase.
 * @param value The value to normalize
 * @returns The normalized value
 */
export declare function normalizeValue(value: string): string;
/**
 * Generates a UUID v4.
 * @returns A UUID v4 string
 */
export declare function uuid(): string;
