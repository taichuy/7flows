import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
  type MouseEvent,
  type TextareaHTMLAttributes,
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
      menu,
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
        ? cloneElement(
            children as ReactElement<DropdownTriggerProps>,
            {
              onClick: (event: MouseEvent<HTMLElement>) => {
                children.props.onClick?.(event);

                if (!disabled) {
                  setOpen((current) => !current);
                }
              }
            }
          )
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
  nodeLabel: 'Start',
  outputKey: 'query',
  outputLabel: '用户输入',
  value: ['node-start', 'query'],
  displayLabel: 'Start / 用户输入'
};

function TemplatedTextHarness() {
  const [value, setValue] = useState('请基于 ');

  return (
    <>
      <TemplatedTextField
        ariaLabel="User Prompt"
        options={[startQueryOption]}
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
  fireEvent.input(editor, {
    data,
    inputType: 'insertText'
  });
}

describe('TemplatedTextField', () => {
  test('renders referenced variables inline inside the editor from stored template text', async () => {
    render(
      <TemplatedTextField
        ariaLabel="User Prompt"
        options={[startQueryOption]}
        value="请基于 {{node-start.query}} 总结"
        onChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Start / 用户输入').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByTestId('templated-text-inline-chip').length).toBeGreaterThan(0);
    expect(
      screen.queryByDisplayValue('请基于 {{node-start.query}} 总结')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('templated-text-references')).not.toBeInTheDocument();
  });

  test('opens variable suggestions when typing trigger characters in the editor', async () => {
    render(<TemplatedTextHarness />);

    const editor = screen.getByLabelText('User Prompt');

    fireEvent.focus(editor);
    triggerEditorInput(editor, '{', '{');

    expect(
      await screen.findByRole('option', { name: 'Start / 用户输入' })
    ).toBeInTheDocument();
  });

  test('inserts selected variables from the toolbar and preserves stored template syntax', async () => {
    render(<TemplatedTextHarness />);

    const editor = screen.getByLabelText('User Prompt');
    fireEvent.focus(editor);

    fireEvent.click(screen.getByRole('button', { name: '插入变量' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Start / 用户输入' }));
    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('menuitem', { name: 'Start / 用户输入' })
      ).not.toBeInTheDocument();
    });

    expect(screen.getAllByText('Start / 用户输入').length).toBeGreaterThan(0);
    expect(screen.getByTestId('templated-text-value')).toHaveTextContent(
      '请基于 {{node-start.query}}'
    );
  });

  test('inserts selected variables and preserves stored template syntax', async () => {
    render(<TemplatedTextHarness />);

    const editor = screen.getByLabelText('User Prompt');

    fireEvent.focus(editor);
    triggerEditorInput(editor, '请基于 /', '/');
    fireEvent.click(await screen.findByRole('option', { name: 'Start / 用户输入' }));

    await waitFor(() => {
      expect(screen.getByText('Start / 用户输入')).toBeInTheDocument();
    });

    expect(editor).toHaveTextContent('请基于 Start / 用户输入');
    expect(screen.getByTestId('templated-text-value')).toHaveTextContent(
      '请基于 {{node-start.query}}'
    );
  });
});
