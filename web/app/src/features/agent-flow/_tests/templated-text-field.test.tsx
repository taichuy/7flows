/* eslint-disable testing-library/no-node-access */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import {
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
  type MouseEvent,
  type TextareaHTMLAttributes
} from 'react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');

  return {
    ...actual,
    Input: {
      ...actual.Input,
      TextArea: ({
        autoSize,
        ...props
      }: TextareaHTMLAttributes<HTMLTextAreaElement> & {
        autoSize?: unknown;
      }) => {
        void autoSize;
        return <textarea {...props} />;
      }
    },
    Dropdown: ({
      children,
      disabled,
      menu
    }: {
      children?: ReactNode;
      disabled?: boolean;
      menu: {
        items: Array<{ key: string; label: ReactNode }>;
        onClick?: (info: { key: string }) => void;
      };
    }) => {
      const [open, setOpen] = useState(false);
      type DropdownTriggerProps = {
        onClick?: (event: MouseEvent<HTMLElement>) => void;
      };

      const trigger = isValidElement<DropdownTriggerProps>(children)
        ? cloneElement(children as ReactElement<DropdownTriggerProps>, {
            onClick: (event: MouseEvent<HTMLElement>) => {
              children.props.onClick?.(event);

              if (!disabled) {
                setOpen((current) => !current);
              }
            }
          })
        : children;

      return (
        <div>
          {trigger}
          {open ? (
            <div role="menu">
              {menu.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    menu.onClick?.({ key: item.key });
                    setOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    }
  };
});

import { TemplatedTextField } from '../components/bindings/TemplatedTextField';
import type { FlowSelectorOption } from '../lib/selector-options';

const startQueryOption: FlowSelectorOption = {
  nodeId: 'node-start',
  nodeLabel: 'node-start',
  outputKey: 'query',
  outputLabel: 'query',
  value: ['node-start', 'query'],
  displayLabel: 'node-start/query'
};

const answerOption: FlowSelectorOption = {
  nodeId: 'node-answer',
  nodeLabel: 'node-answer',
  outputKey: 'answer',
  outputLabel: 'answer',
  value: ['node-answer', 'answer'],
  displayLabel: 'node-answer/answer'
};

function TemplatedTextHarness() {
  const [value, setValue] = useState('请基于 ');

  return (
    <>
      <TemplatedTextField
        label="User Prompt"
        ariaLabel="User Prompt"
        options={[startQueryOption, answerOption]}
        value={value}
        onChange={setValue}
      />
      <div data-testid="templated-text-value">{value}</div>
    </>
  );
}

function triggerEditorInput(editor: HTMLElement, value: string, data: string) {
  if (editor instanceof HTMLTextAreaElement) {
    fireEvent.change(editor, {
      target: { value }
    });
    return;
  }

  editor.textContent = value;
  const textNode = editor.firstChild ?? editor;
  const selection = window.getSelection();

  fireEvent.input(editor, {
    data,
    inputType: 'insertText'
  });

  if (
    selection &&
    typeof selection.removeAllRanges === 'function' &&
    typeof selection.addRange === 'function'
  ) {
    const range = document.createRange();
    const latestTextNode = editor.firstChild ?? textNode;
    const latestTextLength = latestTextNode.textContent?.length ?? 0;
    range.setStart(
      latestTextNode,
      latestTextNode.nodeType === Node.TEXT_NODE ? latestTextLength : 0
    );
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}
function mockSelectionRect(rect: {
  left: number;
  top: number;
  bottom: number;
  width?: number;
  height?: number;
}) {
  return vi.spyOn(document, 'getSelection').mockReturnValue({
    rangeCount: 1,
    getRangeAt: () => ({
      cloneRange() {
        return this;
      },
      getBoundingClientRect: () => ({
        x: rect.left,
        y: rect.top,
        left: rect.left,
        top: rect.top,
        right: rect.left + (rect.width ?? 0),
        bottom: rect.bottom,
        width: rect.width ?? 0,
        height: rect.height ?? Math.max(rect.bottom - rect.top, 0),
        toJSON() {
          return null;
        }
      })
    })
  } as unknown as Selection);
}

describe('TemplatedTextField', () => {
  test('renders referenced variables inline inside the editor from stored template text', async () => {
    render(
      <TemplatedTextField
        label="User Prompt"
        ariaLabel="User Prompt"
        options={[startQueryOption]}
        value="请基于 {{node-start.query}} 总结"
        onChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(
        screen.getAllByText('node-start/query').length
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByTestId('templated-text-inline-chip').length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByDisplayValue('请基于 {{node-start.query}} 总结')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('templated-text-references')
    ).not.toBeInTheDocument();
  });

  test('opens variable suggestions when typing trigger characters in the editor', async () => {
    render(<TemplatedTextHarness />);

    const editor = screen.getByLabelText('User Prompt');

    fireEvent.focus(editor);
    fireEvent.keyDown(editor, { key: '{' });
    triggerEditorInput(editor, '{', '{');

    expect(
      await screen.findByRole('option', { name: 'node-start/query' })
    ).toBeInTheDocument();
  });

  test('opens variable suggestions after a single slash trigger', async () => {
    render(<TemplatedTextHarness />);

    const editor = screen.getByLabelText('User Prompt');

    fireEvent.focus(editor);
    fireEvent.keyDown(editor, { key: '/' });
    triggerEditorInput(editor, '请基于 /', '/');

    expect(
      await screen.findByRole('option', { name: 'node-start/query' })
    ).toBeInTheDocument();
  });

  test('opens the same variable picker from the toolbar button', async () => {
    render(<TemplatedTextHarness />);

    fireEvent.click(screen.getByRole('button', { name: '插入变量' }));

    expect(
      await screen.findByRole('listbox', { name: '变量建议' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'node-start/query' })
    ).toBeInTheDocument();
  });

  test('keeps the toolbar picker open after the editor blurs to the toolbar action', async () => {
    render(<TemplatedTextHarness />);

    const editor = screen.getByLabelText('User Prompt');
    const insertButton = screen.getByRole('button', { name: '插入变量' });

    fireEvent.focus(editor);
    fireEvent.blur(editor, { relatedTarget: insertButton });
    fireEvent.click(insertButton);

    expect(
      await screen.findByRole('listbox', { name: '变量建议' })
    ).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 150);
      });
    });

    expect(
      screen.getByRole('option', { name: 'node-start/query' })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('option', { name: 'node-start/query' })
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('listbox', { name: '变量建议' })
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('templated-text-value')).toHaveTextContent(
        '请基于 {{node-start.query}}'
      );
    });
  });

  test('keeps the toolbar picker open after focus moves into the portal searchbox', async () => {
    render(<TemplatedTextHarness />);

    const editor = screen.getByLabelText('User Prompt');

    fireEvent.focus(editor);
    fireEvent.click(screen.getByRole('button', { name: '插入变量' }));

    const searchbox = await screen.findByRole('searchbox', {
      name: '搜索变量'
    });

    fireEvent.focus(editor);
    fireEvent.blur(editor);
    searchbox.focus();

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 150);
      });
    });

    expect(
      screen.getByRole('option', { name: 'node-start/query' })
    ).toBeInTheDocument();
  });

  test('filters variable suggestions inside the shared picker', async () => {
    render(<TemplatedTextHarness />);

    fireEvent.click(screen.getByRole('button', { name: '插入变量' }));

    const searchbox = await screen.findByRole('searchbox', {
      name: '搜索变量'
    });

    fireEvent.change(searchbox, {
      target: { value: 'answer' }
    });

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'node-answer/answer' })
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('option', { name: 'node-start/query' })
    ).not.toBeInTheDocument();
  });
  test('supports keyboard navigation and enter-to-insert inside the shared picker', async () => {
    render(<TemplatedTextHarness />);

    fireEvent.click(screen.getByRole('button', { name: '插入变量' }));

    const listbox = await screen.findByRole('listbox', { name: '变量建议' });

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'node-answer/answer' })
      ).toHaveAttribute('aria-selected', 'true');
    });

    fireEvent.keyDown(listbox, { key: 'Enter' });

    await waitFor(() => {
      expect(
        screen.queryByRole('listbox', { name: '变量建议' })
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('templated-text-value')).toHaveTextContent(
      '请基于 {{node-answer.answer}}'
    );
  });

  test('does not insert twice when Enter bubbles from the searchbox', async () => {
    render(<TemplatedTextHarness />);

    fireEvent.click(screen.getByRole('button', { name: '插入变量' }));
    const searchbox = await screen.findByRole('searchbox', {
      name: '搜索变量'
    });

    fireEvent.keyDown(searchbox, { key: 'Enter' });

    await waitFor(() => {
      expect(
        screen.queryByRole('listbox', { name: '变量建议' })
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('templated-text-value')).toHaveTextContent(
      '请基于 {{node-start.query}}'
    );
  });

  test('positions the picker near the editor caret when opened from typing', async () => {
    const selectionSpy = mockSelectionRect({
      left: 168,
      top: 220,
      bottom: 244,
      width: 0,
      height: 24
    });

    render(<TemplatedTextHarness />);

    const editor = screen.getByLabelText('User Prompt');
    const originalGetBoundingClientRect =
      editor.parentElement?.getBoundingClientRect.bind(editor.parentElement);

    if (!editor.parentElement || !originalGetBoundingClientRect) {
      throw new Error('missing templated text shell');
    }

    editor.parentElement.getBoundingClientRect = () =>
      ({
        x: 40,
        y: 120,
        left: 40,
        top: 120,
        right: 360,
        bottom: 252,
        width: 320,
        height: 132,
        toJSON() {
          return null;
        }
      }) as DOMRect;

    fireEvent.focus(editor);
    fireEvent.keyDown(editor, { key: '/' });
    triggerEditorInput(editor, '请基于 /', '/');

    const listbox = await screen.findByRole('listbox', { name: '变量建议' });

    expect(listbox).toHaveStyle({
      left: '168px',
      top: '252px',
      width: '304px'
    });

    editor.parentElement.getBoundingClientRect = originalGetBoundingClientRect;
    selectionSpy.mockRestore();
  });

  test('renders variable suggestions above the clipped field frame', async () => {
    render(<TemplatedTextHarness />);

    fireEvent.click(screen.getByRole('button', { name: '插入变量' }));

    const listbox = await screen.findByRole('listbox', { name: '变量建议' });
    const fieldFrame = document.querySelector(
      '.agent-flow-templated-text-field__frame'
    );

    expect(fieldFrame).not.toBeNull();
    expect(fieldFrame?.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
  });

  test('inserts selected variables from the toolbar and preserves stored template syntax', async () => {
    render(<TemplatedTextHarness />);

    const editor = screen.getByLabelText('User Prompt');
    fireEvent.focus(editor);

    fireEvent.click(screen.getByRole('button', { name: '插入变量' }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'node-start/query' })
    );
    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('option', { name: 'node-start/query' })
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getAllByText('node-start/query').length
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('templated-text-value')).toHaveTextContent(
      '请基于 {{node-start.query}}'
    );
  });

  test('inserts selected variables and preserves stored template syntax', async () => {
    render(<TemplatedTextHarness />);

    const editor = screen.getByLabelText('User Prompt');

    fireEvent.focus(editor);
    triggerEditorInput(editor, '请基于 /', '/');
    fireEvent.keyDown(editor, { key: '/' });
    fireEvent.click(
      await screen.findByRole('option', { name: 'node-start/query' })
    );

    await waitFor(() => {
      expect(screen.getByText('node-start/query')).toBeInTheDocument();
    });

    expect(editor).toHaveTextContent('请基于 node-start/query');
    expect(screen.getByTestId('templated-text-value')).toHaveTextContent(
      '请基于 {{node-start.query}}'
    );
  });
});
