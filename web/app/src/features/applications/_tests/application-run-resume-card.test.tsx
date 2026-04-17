import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ApplicationRunResumeCard } from '../components/logs/ApplicationRunResumeCard';

describe('ApplicationRunResumeCard', () => {
  test('submits waiting_human input payload', async () => {
    const onResume = vi.fn().mockResolvedValue(undefined);

    render(
      <ApplicationRunResumeCard
        detail={{
          flow_run: { status: 'waiting_human' },
          checkpoints: [
            {
              id: 'checkpoint-1',
              locator_payload: { node_id: 'node-human' },
              external_ref_payload: { prompt: '请人工审核' }
            }
          ],
          callback_tasks: []
        } as never}
        onResume={onResume}
        onCompleteCallback={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('人工输入'), {
      target: { value: '已审核通过' }
    });
    fireEvent.click(screen.getByRole('button', { name: '提交并继续' }));

    await waitFor(() => {
      expect(onResume).toHaveBeenCalledWith('checkpoint-1', {
        'node-human': { input: '已审核通过' }
      });
    });
  });
});
