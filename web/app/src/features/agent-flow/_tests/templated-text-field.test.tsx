import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
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
        autoSize: _autoSize,
        ...props
      }: TextareaHTMLAttributes<HTMLTextAreaElement> & {
        autoSize?: unknown;
      }) => <textarea {...props} />
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

      const trigger = isValidElement(children)
        ? cloneElement(
            children as ReactElement<{ onClick?: (event: React.MouseEvent) => void }>,
            {
              onClick: (event) => {
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

function TemplatedTextHarness() {
  const [value, setValue] = useState('请基于 ');

  return (
    <TemplatedTextField
      ariaLabel="User Prompt"
      options={[
        {
          nodeId: 'node-start',
          nodeLabel: 'Start',
          outputKey: 'query',
          outputLabel: '用户输入',
          value: ['node-start', 'query'],
          displayLabel: 'Start / 用户输入'
        }
      ]}
      value={value}
      onChange={setValue}
    />
  );
}

describe('TemplatedTextField', () => {
  test('inserts selected variables into the textarea and shows the referenced outputs', async () => {
    render(<TemplatedTextHarness />);

    const textarea = screen.getByLabelText('User Prompt') as HTMLTextAreaElement;

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '插入变量' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Start / 用户输入' }));
    });
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

    expect(textarea).toHaveValue('请基于 {{node-start.query}}');
    expect(screen.getByText('已引用变量')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('templated-text-references')).getByText(
        'Start / 用户输入'
      )
    ).toBeInTheDocument();
  });
});
