import express, { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AsyncLocalStorage } from 'async_hooks';
import dotenv from 'dotenv';

dotenv.config();

// Attio API configuration
const ATTIO_API_URL = 'https://api.attio.com/v2';

// Create AsyncLocalStorage for request context
const asyncLocalStorage = new AsyncLocalStorage<{
  attioClient: AttioClient;
}>();

// Attio API Client
class AttioClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = ATTIO_API_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<unknown> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Attio API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  async searchPeople(filters: Record<string, unknown> = {}, limit: number = 25): Promise<unknown> {
    if (Object.keys(filters).length === 0) {
      return this.makeRequest('/objects/people/records/query', {
        method: 'POST',
        body: JSON.stringify({
          limit,
        }),
      });
    }
    return this.makeRequest('/objects/people/records/query', {
      method: 'POST',
      body: JSON.stringify({
        filter: filters,
        limit,
      }),
    });
  }

  async searchCompanies(
    filters: Record<string, unknown> = {},
    limit: number = 25,
  ): Promise<unknown> {
    if (Object.keys(filters).length === 0) {
      return this.makeRequest('/objects/companies/records/query', {
        method: 'POST',
        body: JSON.stringify({
          limit,
        }),
      });
    }
    return this.makeRequest('/objects/companies/records/query', {
      method: 'POST',
      body: JSON.stringify({
        filter: filters,
        limit,
      }),
    });
  }

  async searchDeals(filters: Record<string, unknown> = {}, limit: number = 25): Promise<unknown> {
    if (Object.keys(filters).length === 0) {
      return this.makeRequest('/objects/deals/records/query', {
        method: 'POST',
        body: JSON.stringify({
          limit,
        }),
      });
    }
    return this.makeRequest('/objects/deals/records/query', {
      method: 'POST',
      body: JSON.stringify({
        filter: filters,
        limit,
      }),
    });
  }

  async searchNotes(query: string, limit: number = 50): Promise<unknown> {
    // First, get all notes (up to the limit)
    const allNotesRaw = await this.makeRequest(`/notes?limit=${limit}`, {
      method: 'GET',
    });
    // Type guard for allNotes
    const allNotes =
      typeof allNotesRaw === 'object' &&
      allNotesRaw !== null &&
      'data' in allNotesRaw &&
      Array.isArray((allNotesRaw as { data: unknown }).data)
        ? (allNotesRaw as { data: Array<Record<string, unknown>> })
        : { data: [] };

    // If no query provided, return all notes
    if (!query || query.trim() === '') {
      return allNotes;
    }

    // Filter notes based on query matching title or content
    const queryLower = query.toLowerCase();
    const filteredNotes = allNotes.data.filter((note) => {
      const titleMatch =
        typeof note.title === 'string' && note.title.toLowerCase().includes(queryLower);
      const contentPlaintextMatch =
        typeof note.content_plaintext === 'string' &&
        note.content_plaintext.toLowerCase().includes(queryLower);
      const contentMarkdownMatch =
        typeof note.content_markdown === 'string' &&
        note.content_markdown.toLowerCase().includes(queryLower);

      return titleMatch || contentPlaintextMatch || contentMarkdownMatch;
    });

    return {
      ...allNotes,
      data: filteredNotes,
    };
  }

  async createNote(data: {
    parent_object: string;
    parent_record_id: string;
    title: string;
    content: string;
    format?: 'plaintext' | 'markdown';
  }): Promise<unknown> {
    return this.makeRequest('/notes', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          parent_object: data.parent_object,
          parent_record_id: data.parent_record_id,
          title: data.title,
          format: data.format || 'plaintext',
          content: data.content,
        },
      }),
    });
  }

  async createPerson(data: {
    name?: string;
    email_addresses?: string[];
    phone_numbers?: string[];
    job_title?: string;
    description?: string;
  }): Promise<unknown> {
    const recordData: Record<string, unknown> = {};

    if (data.name) {
      recordData.name = data.name;
    }
    if (data.email_addresses) {
      recordData.email_addresses = data.email_addresses;
    }
    if (data.phone_numbers) {
      recordData.phone_numbers = data.phone_numbers.map((phoneNumber) => ({
        original_phone_number: phoneNumber,
      }));
    }
    if (data.job_title) {
      recordData.job_title = data.job_title;
    }
    if (data.description) {
      recordData.description = data.description;
    }

    return this.makeRequest('/objects/people/records', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          values: recordData,
        },
      }),
    });
  }

  async createCompany(data: {
    name?: string;
    domains?: string[];
    description?: string;
  }): Promise<unknown> {
    const recordData: Record<string, unknown> = {};

    if (data.name) recordData.name = data.name;
    if (data.domains) recordData.domains = data.domains;
    if (data.description) recordData.description = data.description;

    return this.makeRequest('/objects/companies/records', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          values: recordData,
        },
      }),
    });
  }

  async updatePerson(
    recordId: string,
    data: {
      name?: string;
      email_addresses?: string[];
      phone_numbers?: string[];
      job_title?: string;
      description?: string;
      company_id?: string;
    },
  ): Promise<unknown> {
    const recordData: Record<string, unknown> = {};

    if (data.name) {
      recordData.name = data.name;
    }
    if (data.email_addresses) {
      recordData.email_addresses = data.email_addresses;
    }
    if (data.phone_numbers) {
      recordData.phone_numbers = data.phone_numbers.map((phoneNumber) => ({
        original_phone_number: phoneNumber,
      }));
    }
    if (data.job_title) {
      recordData.job_title = data.job_title;
    }
    if (data.description) {
      recordData.description = data.description;
    }

    return this.makeRequest(`/objects/people/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          values: recordData,
        },
      }),
    });
  }

  async updateCompany(
    recordId: string,
    data: {
      name?: string;
      domains?: string[];
      description?: string;
    },
  ): Promise<unknown> {
    const recordData: Record<string, unknown> = {};

    if (data.name) recordData.name = data.name;
    if (data.domains) recordData.domains = data.domains;
    if (data.description) recordData.description = data.description;

    return this.makeRequest(`/objects/companies/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          values: recordData,
        },
      }),
    });
  }
}

// Getter function for the client
function getAttioClient() {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    throw new Error('Attio client not found in AsyncLocalStorage');
  }
  return store.attioClient;
}

// Tool definitions
const SEARCH_PEOPLE_TOOL: Tool = {
  name: 'attio_search_people',
  description:
    'Search for people in your Attio workspace with advanced filtering options. If no parameter other than limit is provided, it will search all people.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query for people (searches across name, email, company, job title, description, etc.)',
      },
      email: {
        type: 'string',
        description: 'Filter by email address',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 25, max: 50)',
        default: 25,
      },
    },
  },
};

const SEARCH_COMPANIES_TOOL: Tool = {
  name: 'attio_search_companies',
  description:
    'Search for companies in your Attio workspace with filtering and sorting. If no parameter other than limit is provided, it will search all companies.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query for companies (searches across name, domain, description, employees names, employees descriptions, etc.)',
      },
      domain: {
        type: 'string',
        description: 'Filter by company domain',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 25, max: 50)',
        default: 25,
      },
    },
  },
};

const SEARCH_DEALS_TOOL: Tool = {
  name: 'attio_search_deals',
  description:
    'Search for deals in your Attio workspace with stage and value filtering. If no parameter other than limit is provided, it will search all deals.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Filter by deal name',
      },
      stage: {
        type: 'string',
        description: 'Filter by deal stage (one of "Lead", "In Progress", "Won 🎉", "Lost")',
      },
      minValue: {
        type: 'number',
        description: 'Minimum deal value',
      },
      maxValue: {
        type: 'number',
        description: 'Maximum deal value',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 25, max: 50)',
        default: 25,
      },
    },
  },
};

const SEARCH_NOTES_TOOL: Tool = {
  name: 'attio_search_notes',
  description:
    'Search for notes across all objects in your Attio workspace by fetching all notes and filtering by content.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query for notes content (searches title, plaintext content, and markdown content). Leave empty to get all notes.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of notes to fetch and search through (default: 50, max: 50)',
        default: 50,
      },
    },
  },
};

const CREATE_NOTE_TOOL: Tool = {
  name: 'attio_create_note',
  description: 'Create a new note for a given record in Attio.',
  inputSchema: {
    type: 'object',
    properties: {
      parent_object: {
        type: 'string',
        description: 'The object type to attach the note to (e.g., "people", "companies", "deals")',
        enum: ['people', 'companies', 'deals'],
      },
      parent_record_id: {
        type: 'string',
        description: 'The ID of the record to attach the note to',
      },
      title: {
        type: 'string',
        description: 'Title of the note',
      },
      content: {
        type: 'string',
        description: 'Content of the note',
      },
      format: {
        type: 'string',
        description: 'Format of the note content',
        enum: ['plaintext', 'markdown'],
        default: 'plaintext',
      },
    },
    required: ['parent_object', 'parent_record_id', 'title', 'content'],
  },
};

const CREATE_PERSON_TOOL: Tool = {
  name: 'attio_create_person',
  description: 'Create a new person record in your Attio workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Full name of the person',
      },
      email_addresses: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of email addresses for the person',
      },
      phone_numbers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of phone numbers for the person',
      },
      job_title: {
        type: 'string',
        description: 'Job title of the person',
      },
      description: {
        type: 'string',
        description: 'Description or notes about the person',
      },
    },
  },
};

const CREATE_COMPANY_TOOL: Tool = {
  name: 'attio_create_company',
  description: 'Create a new company record in your Attio workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the company',
      },
      domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of domain names associated with the company',
      },
      description: {
        type: 'string',
        description: 'Description of the company',
      },
    },
  },
};

const UPDATE_PERSON_TOOL: Tool = {
  name: 'attio_update_person',
  description: 'Update an existing person record in your Attio workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      record_id: {
        type: 'string',
        description: 'ID of the person record to update',
      },
      name: {
        type: 'string',
        description: 'Full name of the person',
      },
      email_addresses: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of email addresses for the person',
      },
      phone_numbers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of phone numbers for the person',
      },
      job_title: {
        type: 'string',
        description: 'Job title of the person',
      },
      description: {
        type: 'string',
        description: 'Description or notes about the person',
      },
    },
    required: ['record_id'],
  },
};

const UPDATE_COMPANY_TOOL: Tool = {
  name: 'attio_update_company',
  description: 'Update an existing company record in your Attio workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      record_id: {
        type: 'string',
        description: 'ID of the company record to update',
      },
      name: {
        type: 'string',
        description: 'Name of the company',
      },
      domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of domain names associated with the company',
      },
      description: {
        type: 'string',
        description: 'Description of the company',
      },
    },
    required: ['record_id'],
  },
};

// Utility functions
function safeLog(_level: string, _data: unknown) {
  // Logging disabled for lint compliance
}

// Main server function
const getAttioMcpServer = () => {
  const server = new Server(
    {
      name: 'attio-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        SEARCH_PEOPLE_TOOL,
        SEARCH_COMPANIES_TOOL,
        SEARCH_DEALS_TOOL,
        SEARCH_NOTES_TOOL,
        CREATE_NOTE_TOOL,
        CREATE_PERSON_TOOL,
        CREATE_COMPANY_TOOL,
        UPDATE_PERSON_TOOL,
        UPDATE_COMPANY_TOOL,
      ],
    };
  });

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: { params: { name: string; arguments: Record<string, unknown> } }) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'attio_search_people': {
            const client = getAttioClient();
            const filters: Record<string, unknown> = {};

            if (typeof args?.query === 'string') {
              filters.$or = [
                { name: { $contains: args.query } },
                { email_addresses: { $contains: args.query } },
                { description: { $contains: args.query } },
                { job_title: { $contains: args.query } },
                {
                  path: [
                    ['people', 'company'],
                    ['companies', 'name'],
                  ],
                  constraints: {
                    $contains: args.query,
                  },
                },
                {
                  path: [
                    ['people', 'company'],
                    ['companies', 'description'],
                  ],
                  constraints: {
                    $contains: args.query,
                  },
                },
                { primary_location: { locality: { $contains: args.query } } },
              ];
            }
            if (typeof args?.email === 'string') {
              filters.email_addresses = args.email;
            }

            const result = await client.searchPeople(
              filters,
              typeof args?.limit === 'number' ? args.limit : 25,
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'attio_search_companies': {
            const client = getAttioClient();
            const filters: Record<string, unknown> = {};

            if (typeof args?.query === 'string') {
              filters.$or = [
                { name: { $contains: args.query } },
                { domains: { domain: { $contains: args.query } } },
                { description: { $contains: args.query } },
                { primary_location: { locality: { $contains: args.query } } },
                {
                  path: [
                    ['companies', 'team'],
                    ['people', 'name'],
                  ],
                  constraints: {
                    $contains: args.query,
                  },
                },
                {
                  path: [
                    ['companies', 'team'],
                    ['people', 'description'],
                  ],
                  constraints: {
                    $contains: args.query,
                  },
                },
              ];
            }
            if (typeof args?.domain === 'string') {
              filters.domains = { domain: args.domain };
            }

            const result = await client.searchCompanies(
              filters,
              typeof args?.limit === 'number' ? args.limit : 25,
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'attio_search_deals': {
            const client = getAttioClient();
            const filters: Record<string, unknown> = {};

            if (typeof args?.name === 'string') {
              filters.name = { $contains: args.name };
            }
            if (typeof args?.stage === 'string') {
              filters.stage = args.stage;
            }
            if (typeof args?.minValue === 'number' || typeof args?.maxValue === 'number') {
              filters.value = {};
              if (typeof args?.minValue === 'number') {
                (filters.value as Record<string, unknown>).$gte = args.minValue;
              }
              if (typeof args?.maxValue === 'number') {
                (filters.value as Record<string, unknown>).$lte = args.maxValue;
              }
            }

            const result = await client.searchDeals(
              filters,
              typeof args?.limit === 'number' ? args.limit : 25,
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'attio_search_notes': {
            const client = getAttioClient();
            const result = await client.searchNotes(
              typeof args?.query === 'string' ? args.query : '',
              typeof args?.limit === 'number' ? args.limit : 50,
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'attio_create_note': {
            const client = getAttioClient();

            const result = await client.createNote({
              parent_object: typeof args?.parent_object === 'string' ? args.parent_object : '',
              parent_record_id:
                typeof args?.parent_record_id === 'string' ? args.parent_record_id : '',
              title: typeof args?.title === 'string' ? args.title : '',
              content: typeof args?.content === 'string' ? args.content : '',
              format:
                typeof args?.format === 'string'
                  ? (args.format as 'plaintext' | 'markdown')
                  : 'plaintext',
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'attio_create_person': {
            const client = getAttioClient();

            const result = await client.createPerson({
              name: typeof args?.name === 'string' ? args.name : undefined,
              email_addresses: Array.isArray(args?.email_addresses)
                ? (args.email_addresses as string[])
                : undefined,
              phone_numbers: Array.isArray(args?.phone_numbers)
                ? (args.phone_numbers as string[])
                : undefined,
              job_title: typeof args?.job_title === 'string' ? args.job_title : undefined,
              description: typeof args?.description === 'string' ? args.description : undefined,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'attio_create_company': {
            const client = getAttioClient();

            const result = await client.createCompany({
              name: typeof args?.name === 'string' ? args.name : undefined,
              domains: Array.isArray(args?.domains) ? (args.domains as string[]) : undefined,
              description: typeof args?.description === 'string' ? args.description : undefined,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'attio_update_person': {
            const client = getAttioClient();

            const result = await client.updatePerson(
              typeof args?.record_id === 'string' ? args.record_id : '',
              {
                name: typeof args?.name === 'string' ? args.name : undefined,
                email_addresses: Array.isArray(args?.email_addresses)
                  ? (args.email_addresses as string[])
                  : undefined,
                phone_numbers: Array.isArray(args?.phone_numbers)
                  ? (args.phone_numbers as string[])
                  : undefined,
                job_title: typeof args?.job_title === 'string' ? args.job_title : undefined,
                description: typeof args?.description === 'string' ? args.description : undefined,
              },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'attio_update_company': {
            const client = getAttioClient();

            const result = await client.updateCompany(
              typeof args?.record_id === 'string' ? args.record_id : '',
              {
                name: typeof args?.name === 'string' ? args.name : undefined,
                domains: Array.isArray(args?.domains) ? (args.domains as string[]) : undefined,
                description: typeof args?.description === 'string' ? args.description : undefined,
              },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const err = error as Error;
        safeLog('error', `Tool ${name} failed: ${err.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
};

const app = express();

//=============================================================================
// STREAMABLE HTTP TRANSPORT (PROTOCOL VERSION 2025-03-26)
//=============================================================================

app.post('/mcp', async (req: Request, res: Response) => {
  const apiKey = process.env.ATTIO_API_KEY || (req.headers['x-auth-token'] as string);

  if (!apiKey) {
    // Logging disabled for lint compliance
    return;
  }

  const attioClient = new AttioClient(apiKey);

  const server = getAttioMcpServer();
  try {
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    asyncLocalStorage.run({ attioClient }, async () => {
      await transport.handleRequest(req, res, req.body);
    });
    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    // Logging disabled for lint compliance
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req: Request, res: Response) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    }),
  );
});

app.delete('/mcp', async (req: Request, res: Response) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    }),
  );
});

//=============================================================================
// DEPRECATED HTTP+SSE TRANSPORT (PROTOCOL VERSION 2024-11-05)
//=============================================================================

// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports = new Map<string, SSEServerTransport>();

app.get('/sse', async (req: Request, res: Response) => {
  const transport = new SSEServerTransport(`/messages`, res);

  // Set up cleanup when connection closes
  res.on('close', async () => {
    try {
      transports.delete(transport.sessionId);
    } finally {
      // Empty block for lint compliance
    }
  });

  transports.set(transport.sessionId, transport);

  const server = getAttioMcpServer();
  await server.connect(transport);
});

app.post('/messages', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (transport) {
    const apiKey = process.env.ATTIO_API_KEY || (req.headers['x-auth-token'] as string);
    if (!apiKey) {
      // Logging disabled for lint compliance
      return;
    }
    const attioClient = new AttioClient(apiKey);
    asyncLocalStorage.run({ attioClient }, async () => {
      await transport.handlePostMessage(req, res);
    });
  } else {
    // Logging disabled for lint compliance
    res.status(404).send({ error: 'Transport not found' });
  }
});

app.listen(5000, () => {
  // Logging disabled for lint compliance
});
