/** Represents a single block of content within a node's content array. */
export interface ContentBlock {
    type: "text" | "mention" | "replacement";
    value: string;
    styles?: number;
    mentionTrigger?: string;
}

/** Represents the structure of a Mew Graph Node. */
export interface GraphNode {
    version: number;
    id: string;
    authorId: string;
    createdAt: string;
    updatedAt: string;
    content: ContentBlock[];
    isPublic: boolean;
    isNewRelatedObjectsPublic: boolean;
    relationId: string | null;
    canonicalRelationId: string | null;
    isChecked: boolean | null;
}

// Zod schema for ContentBlock
import { z } from "zod";

export const ContentBlockSchema = z.object({
    type: z.enum(["text", "mention", "replacement"]),
    value: z.string(),
    styles: z.number().optional(),
    mentionTrigger: z.string().optional(),
});

// Zod schema for GraphNode
export const GraphNodeSchema = z.object({
    version: z.number(),
    id: z.string(),
    authorId: z.string(),
    createdAt: z.string(), // Consider z.string().datetime() if Zod version >= 3.22 and format is ISO
    updatedAt: z.string(), // Consider z.string().datetime() if Zod version >= 3.22 and format is ISO
    content: z.array(ContentBlockSchema),
    isPublic: z.boolean(),
    isNewRelatedObjectsPublic: z.boolean(),
    relationId: z.string().nullable(),
    canonicalRelationId: z.string().nullable(),
    isChecked: z.boolean().nullable(),
});

/** Represents the structure of a Mew Relation. */
export interface Relation {
    id: string;
    version: number;
    authorId: string;
    createdAt: number;
    updatedAt: number;
    fromId: string;
    toId: string;
    relationTypeId: string;
    isPublic: boolean;
    canonicalRelationId: string | null;
}

/** Defines the expected structure for user data within API responses. */
export interface User {
    id: string;
    username: string;
    email: string;
}

/** Defines the overall structure of the data returned by the /sync or /layer endpoints. */
export interface SyncResponse {
    data: {
        usersById: {
            [key: string]: User;
        };
        nodesById: {
            [key: string]: GraphNode;
        };
        relationsById: {
            [key: string]: Relation;
        };
    };
}

/** Represents the types of content a Mew node can primarily consist of. */
export enum NodeContentType {
    Text = "text",
    Replacement = "replacement",
    Mention = "mention",
}

/** Represents data needed for a replacement-type node. */
export interface ReplacementNodeData {
    referenceNodeId: string;
    referenceCanonicalRelationId: string;
}

/** Represents data needed for a mention-type node. */
export interface MentionData {
    preMentionText: string;
    postMentionText: string;
    mentionNodeId: string;
}

/** Union type representing the simplified input for node content creation. */
export type NodeContent =
    | { type: NodeContentType.Text; text: string }
    | {
          type: NodeContentType.Replacement;
          replacementNodeData: ReplacementNodeData;
      }
    | { type: NodeContentType.Mention; mentionData: MentionData };

/** Represents the structure of the response from the Auth0 token endpoint. */
export interface TokenData {
    access_token: string;
    expires_in: number;
    token_type: string;
}

/** Configuration for the MCP client. */
export interface MCPConfig {
    baseUrl: string;
    baseNodeUrl: string;
    auth0Domain: string;
    auth0ClientId: string;
    auth0ClientSecret: string;
    auth0Audience: string;
    userRootNodeId: string;
}
