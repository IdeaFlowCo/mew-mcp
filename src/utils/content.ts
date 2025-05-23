import crypto from "crypto";
import { NodeContentType, ContentBlock } from "../types/node.js";

/**
 * Formats various input content types into the structured array format
 * expected by the Mew API's `node.content` field.
 * @param content The input content (string, object, or already formatted array)
 * @returns The formatted content array
 */
export function createNodeContent(content: any): ContentBlock[] {
    // If content is already in the correct format, return it
    if (Array.isArray(content)) {
        return content;
    }

    // Handle our NodeContent type
    if (content.type === NodeContentType.Text) {
        return [{ type: "text", value: content.text }];
    } else if (content.type === "text" && content.text) {
        // Handle the format coming from mewClipper
        return [{ type: "text", value: content.text }];
    } else if (content.type === NodeContentType.Mention) {
        return [
            {
                type: "text",
                value: content.mentionData.preMentionText,
            },
            {
                type: "mention",
                value: content.mentionData.mentionNodeId,
                mentionTrigger: "@",
            },
            {
                type: "text",
                value: content.mentionData.postMentionText,
            },
        ];
    } else if (content.type === NodeContentType.Replacement) {
        return [{ type: "text", value: "replacement" }];
    }

    // Default case
    return [{ type: "text", value: "" }];
}

/**
 * Extracts the text value from a simple Mew text node's content array.
 * @param node The Mew GraphNode to extract text from
 * @returns The text value or null if not found/applicable
 */
export function getNodeTextContent(node: any): string | null {
    if (
        node &&
        node.content &&
        node.content.length > 0 &&
        node.content[0].type === "text"
    ) {
        return node.content[0].value;
    }
    return null;
}

/**
 * Normalizes a value for comparison by trimming whitespace and converting to lowercase.
 * @param value The value to normalize
 * @returns The normalized value
 */
export function normalizeValue(value: string): string {
    return value.toLowerCase().trim();
}

/**
 * Generates a UUID v4.
 * @returns A UUID v4 string
 */
export function uuid(): string {
    return crypto.randomUUID();
}
