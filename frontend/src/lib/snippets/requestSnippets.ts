export type BodySnippet = {
  id: string;
  label: string;
  description: string;
  mode: 'raw' | 'json';
  text: string;
};

export const BODY_SNIPPETS: BodySnippet[] = [
  {
    id: 'json-empty-object',
    label: 'JSON object',
    description: 'Insert an empty JSON object.',
    mode: 'json',
    text: '{\n  \n}',
  },
  {
    id: 'json-pagination',
    label: 'Pagination payload',
    description: 'Common page/limit filters.',
    mode: 'json',
    text: '{\n  "page": 1,\n  "limit": 50,\n  "sort": "created_at:desc"\n}',
  },
  {
    id: 'oauth-password',
    label: 'OAuth password grant',
    description: 'OAuth token body scaffold.',
    mode: 'raw',
    text: 'grant_type=password&username={{username}}&password={{password}}&client_id={{client_id}}&client_secret={{client_secret}}',
  },
  {
    id: 'graphql-request',
    label: 'GraphQL request',
    description: 'GraphQL query + variables scaffold.',
    mode: 'json',
    text: '{\n  "query": "query Example { __typename }",\n  "variables": {}\n}',
  },
];

export const getBodySnippetById = (id: string): BodySnippet | null =>
  BODY_SNIPPETS.find((item) => item.id === id) || null;
