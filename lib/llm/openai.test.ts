import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { createOpenAIClient, createOpenAIClientJsonObject } from './openai';
import { RateLimitError, LLMError } from './types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenAI Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const TestSchema = z.object({
    message: z.string(),
    count: z.number(),
  });

  describe('createOpenAIClient (JSON Schema mode)', () => {
    it('should make successful API call and parse response', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ message: 'Hello', count: 42 }),
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = createOpenAIClient('test-api-key');
      const result = await client.generateStructured('Test prompt', TestSchema);

      expect(result.data).toEqual({ message: 'Hello', count: 42 });
      expect(result.traceId).toMatch(/^llm-/);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options.headers['Authorization']).toBe('Bearer test-api-key');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('gpt-4o');
      // JSON Schema mode should be used for gpt-4o
      expect(body.response_format.type).toBe('json_schema');
      expect(body.response_format.json_schema.name).toBe('response');
      expect(body.response_format.json_schema.strict).toBe(true);
    });

    it('should use custom schema name', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"message":"test","count":1}' } }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = createOpenAIClient('test-api-key');
      await client.generateStructured('Test', TestSchema, { schemaName: 'custom_response' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.response_format.json_schema.name).toBe('custom_response');
    });

    it('should retry on 5xx errors with exponential backoff', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Server error',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"message":"success","count":1}' } }],
          }),
        });

      const client = createOpenAIClient('test-api-key');
      const result = await client.generateStructured('Test', TestSchema, {
        retryDelayMs: 10, // Speed up test
      });

      expect(result.data.message).toBe('success');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle rate limiting with retry-after header', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([['retry-after', '1']]),
          text: async () => 'Rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"message":"ok","count":0}' } }],
          }),
        });

      // Mock Headers.get
      mockFetch.mock.results[0] = {
        type: 'return',
        value: {
          ok: false,
          status: 429,
          headers: {
            get: (name: string) => (name === 'retry-after' ? '1' : null),
          },
          text: async () => 'Rate limited',
        },
      };

      const start = Date.now();
      const client = createOpenAIClient('test-api-key');
      
      // Reset mock for actual test
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: { get: () => '1' },
          text: async () => 'Rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"message":"ok","count":0}' } }],
          }),
        });

      const result = await client.generateStructured('Test', TestSchema);
      expect(result.data.message).toBe('ok');
    });

    it('should throw on non-retryable API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      const client = createOpenAIClient('test-api-key');

      await expect(client.generateStructured('Test', TestSchema)).rejects.toThrow(LLMError);
    });

    it('should validate response against Zod schema', async () => {
      // Mock all retries with invalid schema response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"message":"test","wrong_field":123}' } }],
        }),
      });

      const client = createOpenAIClient('test-api-key');

      await expect(
        client.generateStructured('Test', TestSchema, {
          maxRetries: 1, // Limit retries to avoid timeout
          retryDelayMs: 10,
        })
      ).rejects.toThrow(/does not match schema/);
    });

    it('should handle model refusals', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: null,
                refusal: 'I cannot help with that request',
              },
            },
          ],
        }),
      });

      const client = createOpenAIClient('test-api-key');

      await expect(client.generateStructured('Test', TestSchema)).rejects.toThrow(/refused/);
    });

    it('should handle empty response', async () => {
      // Mock all retries with empty response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '' } }],
        }),
      });

      const client = createOpenAIClient('test-api-key');

      await expect(
        client.generateStructured('Test', TestSchema, {
          maxRetries: 1,
          retryDelayMs: 10,
        })
      ).rejects.toThrow(/No content/);
    });

    it('should handle invalid JSON in response', async () => {
      // Mock all retries with invalid JSON
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not valid json {' } }],
        }),
      });

      const client = createOpenAIClient('test-api-key');

      await expect(
        client.generateStructured('Test', TestSchema, {
          maxRetries: 1,
          retryDelayMs: 10,
        })
      ).rejects.toThrow(/Invalid JSON/);
    });
  });

  describe('createOpenAIClientJsonObject (fallback mode)', () => {
    it('should use json_object format instead of json_schema', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"message":"test","count":1}' } }],
        }),
      });

      const client = createOpenAIClientJsonObject('test-api-key');
      await client.generateStructured('Test', TestSchema);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });
  });

  describe('Zod to JSON Schema conversion', () => {
    it('should correctly convert complex nested schema', async () => {
      const ComplexSchema = z.object({
        post: z.object({
          title: z.string().min(1).max(300),
          body_md: z.string(),
          tags: z.array(z.string()),
          metadata: z
            .object({
              views: z.number(),
              featured: z.boolean(),
            })
            .nullable(),
        }),
        status: z.enum(['draft', 'published', 'archived']),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  post: {
                    title: 'Test',
                    body_md: 'Content',
                    tags: ['tag1'],
                    metadata: { views: 100, featured: true },
                  },
                  status: 'draft',
                }),
              },
            },
          ],
        }),
      });

      const client = createOpenAIClient('test-api-key');
      const result = await client.generateStructured('Test', ComplexSchema);

      expect(result.data.post.title).toBe('Test');
      expect(result.data.status).toBe('draft');

      // Verify the schema was converted correctly
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const jsonSchema = body.response_format.json_schema.schema;

      expect(jsonSchema.type).toBe('object');
      expect(jsonSchema.properties.post.type).toBe('object');
      expect(jsonSchema.properties.post.properties.tags.type).toBe('array');
      expect(jsonSchema.properties.status.enum).toContain('draft');
    });
  });

  describe('Custom options', () => {
    it('should respect custom model and temperature', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"message":"test","count":1}' } }],
        }),
      });

      const client = createOpenAIClient('test-api-key');
      await client.generateStructured('Test', TestSchema, {
        model: 'gpt-4o-mini',
        temperature: 0.5,
        maxTokens: 2000,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(2000);
    });

    it('should fall back to json_object for unsupported models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"message":"test","count":1}' } }],
        }),
      });

      const client = createOpenAIClient('test-api-key');
      await client.generateStructured('Test', TestSchema, {
        model: 'gpt-3.5-turbo', // Not in supported list
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });
  });
});

