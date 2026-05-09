import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ApplicationEnvironmentVariablesPanel } from '../../components/editor/ApplicationEnvironmentVariablesPanel';
import { EnvironmentVariableValueEditor } from '../../components/editor/environment-variables/EnvironmentVariableValueEditor';

describe('ApplicationEnvironmentVariablesPanel', () => {
  test('switches the value editor when the variable type changes', async () => {
    render(
      <ApplicationEnvironmentVariablesPanel
        variables={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /添加环境变量/ }));

    expect(screen.getByPlaceholderText('请输入变量值')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '类型' }));
    fireEvent.click(await screen.findByTitle('number'));

    expect(screen.getByRole('spinbutton')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '类型' }));
    fireEvent.click(await screen.findByTitle('boolean'));

    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();
  });

  test('edits object values as field rows', () => {
    const onChange = vi.fn();

    render(
      <EnvironmentVariableValueEditor
        value={{ ApiBaseUrl: '' }}
        valueType="object"
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText('对象值 1'), {
      target: { value: 'https://api.example.com' }
    });

    expect(onChange).toHaveBeenLastCalledWith({
      ApiBaseUrl: 'https://api.example.com'
    });
  });

  test('edits array string values as item rows', () => {
    const onChange = vi.fn();

    render(
      <EnvironmentVariableValueEditor
        value={['first', '']}
        valueType="array[string]"
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText('数组值 2'), {
      target: { value: 'second' }
    });

    expect(onChange).toHaveBeenLastCalledWith(['first', 'second']);
  });
});
