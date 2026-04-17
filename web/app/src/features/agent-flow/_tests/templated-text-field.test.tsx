import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';

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

    fireEvent.click(screen.getByRole('button', { name: '插入变量' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Start / 用户输入' }));
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
