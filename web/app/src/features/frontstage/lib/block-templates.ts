export type FrontstageBuiltInJsBlockTemplateId =
  | 'blank'
  | 'data-table'
  | 'create-form'
  | 'edit-form'
  | 'search-table';

export interface FrontstageBuiltInJsBlockTemplate {
  id: FrontstageBuiltInJsBlockTemplateId;
  title: string;
  description: string;
}

export type FrontstageBuiltInJsBlockTemplateList =
  readonly FrontstageBuiltInJsBlockTemplate[];

export interface CreateFrontstageBuiltInJsBlockTemplateCodeInput {
  templateId: FrontstageBuiltInJsBlockTemplateId;
  blockId: string;
  codeRef: string;
  contributionCode: string;
}

export type CreateBlankJsBlockTemplateCodeInput = Omit<
  CreateFrontstageBuiltInJsBlockTemplateCodeInput,
  'templateId'
>;

export const FRONTSTAGE_BUILT_IN_JS_BLOCK_TEMPLATES = [
  {
    id: 'blank',
    title: 'Blank JS Block',
    description: 'Start from a minimal JS Block skeleton.'
  },
  {
    id: 'data-table',
    title: 'Data Table',
    description: 'Render records from a data query as a controlled table.'
  },
  {
    id: 'create-form',
    title: 'Create Form',
    description: 'Collect form state and create a data record.'
  },
  {
    id: 'edit-form',
    title: 'Edit Form',
    description: 'Load a record, edit state, and update data.'
  },
  {
    id: 'search-table',
    title: 'Search Table',
    description: 'Search records and trigger row actions from a table.'
  }
] as const satisfies readonly FrontstageBuiltInJsBlockTemplate[];

type TemplateCodeFactory = (
  input: CreateFrontstageBuiltInJsBlockTemplateCodeInput
) => string;

const templateFactories: Record<
  FrontstageBuiltInJsBlockTemplateId,
  TemplateCodeFactory
> = {
  blank: createBlankTemplateCode,
  'data-table': createDataTableTemplateCode,
  'create-form': createCreateFormTemplateCode,
  'edit-form': createEditFormTemplateCode,
  'search-table': createSearchTableTemplateCode
};

export function listFrontstageBuiltInJsBlockTemplates(): FrontstageBuiltInJsBlockTemplateList {
  return FRONTSTAGE_BUILT_IN_JS_BLOCK_TEMPLATES;
}

export function createFrontstageBuiltInJsBlockTemplateCode(
  input: CreateFrontstageBuiltInJsBlockTemplateCodeInput
): string {
  const factory =
    templateFactories[input.templateId as FrontstageBuiltInJsBlockTemplateId];

  if (!factory) {
    throw new Error(
      `Unknown FrontStage built-in JS block template: ${String(
        input.templateId
      )}`
    );
  }

  return factory(input);
}

export function createBlankJsBlockTemplateCode(
  input: CreateBlankJsBlockTemplateCodeInput
): string {
  return createFrontstageBuiltInJsBlockTemplateCode({
    ...input,
    templateId: 'blank'
  });
}

function createBlankTemplateCode(
  input: CreateFrontstageBuiltInJsBlockTemplateCodeInput
): string {
  return `${createTemplateHeader(input)}
import { Alert, Stack, Text, Title } from '@1flowbase/block-renderer/antd-facade';

export default defineBlock({
  id: ${quoteJsString(input.blockId)},
  title: 'Blank JS Block',
  initialState: {
    error: null
  },

  async render(ctx) {
    const error = typeof ctx.state.error === 'string' ? ctx.state.error : null;

    if (ctx.props.__example === true) {
      const records = await ctx.data.query('data_model_code', {
        page: 1,
        pageSize: 20
      });
      const created = await ctx.data.create('data_model_code', {});
      await ctx.data.update('data_model_code', created.id, {});
      await ctx.data.delete('data_model_code', created.id);
      ctx.patch({ records });
      ctx.events.emit('blank.loaded', { count: records.length });
      await ctx.actions.invoke('blank.refresh', { codeRef: ${quoteJsString(
        input.codeRef
      )} });
    }

    return Stack({
      children: [
        Title({ children: 'Blank JS Block' }),
        Text({
          children: 'Start from this built-in blank JS Block skeleton.'
        }),
        error ? Alert({ props: { type: 'error', message: error } }) : null
      ]
    });
  }
});
`;
}

function createDataTableTemplateCode(
  input: CreateFrontstageBuiltInJsBlockTemplateCodeInput
): string {
  return `${createTemplateHeader(input)}
import { Button, Stack, Table, Text, Title } from '@1flowbase/block-renderer/antd-facade';

export default defineBlock({
  id: ${quoteJsString(input.blockId)},
  title: 'Data Table',
  initialState: {
    rows: []
  },

  async render(ctx) {
    const rows = Array.isArray(ctx.state.rows) ? ctx.state.rows : [];

    if (ctx.props.__example === true) {
      const records = await ctx.data.query('orders', {
        page: 1,
        pageSize: 20
      });
      const nextRows = Array.isArray(records) ? records : [];
      ctx.patch({ rows: nextRows });
      ctx.events.emit('orders.loaded', { count: nextRows.length });
    }

    return Stack({
      children: [
        Title({ children: 'Data Table' }),
        Text({ children: 'Query records and render them in a table.' }),
        Table({
          props: {
            rowKey: 'id',
            columns: [
              { key: 'name', title: 'Name', dataIndex: 'name' },
              { key: 'status', title: 'Status', dataIndex: 'status' }
            ],
            dataSource: rows
          },
          permissions: { data: ['query'], events: ['orders.loaded'] }
        }),
        Button({
          props: {
            children: 'Refresh',
            actionId: 'orders.refresh',
            actionPayload: { codeRef: ${quoteJsString(input.codeRef)} }
          }
        })
      ]
    });
  }
});
`;
}

function createCreateFormTemplateCode(
  input: CreateFrontstageBuiltInJsBlockTemplateCodeInput
): string {
  return `${createTemplateHeader(input)}
import { Button, Form, FormItem, Input, Stack, Text, Title } from '@1flowbase/block-renderer/antd-facade';

export default defineBlock({
  id: ${quoteJsString(input.blockId)},
  title: 'Create Form',
  initialState: {
    draft: {
      name: '',
      status: 'draft'
    }
  },

  async render(ctx) {
    const draft = isRecord(ctx.state.draft) ? ctx.state.draft : {};

    if (ctx.props.__example === true) {
      ctx.patch({ draft: { ...draft, status: 'ready' } });
      const created = await ctx.data.create('orders', draft);
      await ctx.actions.invoke('orders.created', { id: created.id });
    }

    return Stack({
      children: [
        Title({ children: 'Create Form' }),
        Text({ children: 'Collect values and create a record.' }),
        Form({
          props: { layout: 'vertical' },
          permissions: { data: ['create'], actions: ['orders.created'] },
          children: [
            FormItem({
              props: { name: 'name', label: 'Name' },
              children: [Input({ props: { value: draft.name } })]
            }),
            FormItem({
              props: { name: 'status', label: 'Status' },
              children: [Input({ props: { value: draft.status } })]
            })
          ]
        }),
        Button({
          props: {
            children: 'Create',
            actionId: 'orders.create',
            actionPayload: { contributionCode: ${quoteJsString(
              input.contributionCode
            )} }
          }
        })
      ]
    });
  }
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
`;
}

function createEditFormTemplateCode(
  input: CreateFrontstageBuiltInJsBlockTemplateCodeInput
): string {
  return `${createTemplateHeader(input)}
import { Button, Form, FormItem, Input, Stack, Text, Title } from '@1flowbase/block-renderer/antd-facade';

export default defineBlock({
  id: ${quoteJsString(input.blockId)},
  title: 'Edit Form',
  initialState: {
    record: null
  },

  async render(ctx) {
    const record = isRecord(ctx.state.record) ? ctx.state.record : {};
    const recordId = typeof ctx.params.recordId === 'string' ? ctx.params.recordId : 'record-id';

    if (ctx.props.__example === true) {
      const loaded = await ctx.data.query('orders', {
        where: { id: recordId }
      });
      const nextRecord = isRecord(loaded) ? loaded : {};
      ctx.patch({ record: nextRecord });
      await ctx.data.update('orders', recordId, nextRecord);
      await ctx.actions.invoke('orders.saved', { id: recordId });
    }

    return Stack({
      children: [
        Title({ children: 'Edit Form' }),
        Text({ children: 'Load a record and submit updates.' }),
        Form({
          props: { layout: 'vertical' },
          permissions: { data: ['query', 'update'] },
          children: [
            FormItem({
              props: { name: 'name', label: 'Name' },
              children: [Input({ props: { value: record.name } })]
            }),
            FormItem({
              props: { name: 'status', label: 'Status' },
              children: [Input({ props: { value: record.status } })]
            })
          ]
        }),
        Button({
          props: {
            children: 'Save',
            actionId: 'orders.save',
            actionPayload: { id: recordId, codeRef: ${quoteJsString(
              input.codeRef
            )} }
          }
        })
      ]
    });
  }
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
`;
}

function createSearchTableTemplateCode(
  input: CreateFrontstageBuiltInJsBlockTemplateCodeInput
): string {
  return `${createTemplateHeader(input)}
import { Button, Form, FormItem, Input, Stack, Table, Text, Title } from '@1flowbase/block-renderer/antd-facade';

export default defineBlock({
  id: ${quoteJsString(input.blockId)},
  title: 'Search Table',
  initialState: {
    query: '',
    rows: []
  },

  async render(ctx) {
    const query = typeof ctx.state.query === 'string' ? ctx.state.query : '';
    const rows = Array.isArray(ctx.state.rows) ? ctx.state.rows : [];

    if (ctx.props.__example === true) {
      ctx.patch({ query });
      const records = await ctx.data.query('orders', {
        filter: { keyword: query },
        page: 1,
        pageSize: 20
      });
      const nextRows = Array.isArray(records) ? records : [];
      ctx.patch({ rows: nextRows });
      await ctx.actions.invoke('orders.search', { query });
      if (nextRows.length > 0) {
        await ctx.data.delete('orders', nextRows[0].id);
      }
    }

    return Stack({
      children: [
        Title({ children: 'Search Table' }),
        Text({ children: 'Search records and handle row actions.' }),
        Form({
          props: { layout: 'inline' },
          children: [
            FormItem({
              props: { name: 'query', label: 'Keyword' },
              children: [Input({ props: { value: query } })]
            }),
            Button({
              props: {
                children: 'Search',
                actionId: 'orders.search',
                actionPayload: { contributionCode: ${quoteJsString(
                  input.contributionCode
                )} }
              }
            })
          ]
        }),
        Table({
          props: {
            rowKey: 'id',
            columns: [
              { key: 'name', title: 'Name', dataIndex: 'name' },
              { key: 'status', title: 'Status', dataIndex: 'status' }
            ],
            dataSource: rows
          },
          permissions: { data: ['query', 'delete'], actions: ['orders.search'] }
        })
      ]
    });
  }
});
`;
}

function createTemplateHeader(
  input: CreateFrontstageBuiltInJsBlockTemplateCodeInput
): string {
  return `import { defineBlock } from '@1flowbase/block-sdk';

// blockId: ${quoteJsString(input.blockId)}
// codeRef: ${quoteJsString(input.codeRef)}
// contributionCode: ${quoteJsString(input.contributionCode)}
`;
}

function quoteJsString(value: string): string {
  return `'${value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')}'`;
}
