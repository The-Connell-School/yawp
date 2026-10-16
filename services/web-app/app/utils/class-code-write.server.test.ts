import { describe, expect, mock, test } from 'bun:test';
import { resolveClassCode, ClassCodeCollisionError } from './class-code-write.server';

function fixture(enabled = true, collisions = 0, ownCode: string | null = null) {
  const tx = {
    setting: { findUnique: mock(async () => ({ value: enabled ? 'true' : 'false' })) },
    class: { findMany: mock(async () => [
      ...(ownCode === null ? [] : [{ id: 'self', code: ownCode }]),
      ...Array.from({ length: collisions }, (_, i) => ({ id: `other-${i}`, code: i === 0 ? 'ABC123' : 'NEW123' })),
    ]) },
    $executeRaw: mock(async () => 1),
  };
  return tx;
}

describe('transactional class codes', () => {
  test('flag off makes no lock or collision queries and preserves caller code', async () => {
    const tx = fixture(false);
    expect(await resolveClassCode(tx as any, 'LEGACY')).toBe('LEGACY');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.class.findMany).not.toHaveBeenCalled();
  });
  test('targeted mode is off: uniqueness must cover every writer', async () => {
    const tx = fixture();
    tx.setting.findUnique.mockResolvedValue({ value: '{"mode":"targeted","orgIds":["org"]}' });
    await resolveClassCode(tx as any, 'LEGACY');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  test('takes the transaction lock before checking availability', async () => {
    const tx = fixture();
    expect(await resolveClassCode(tx as any, ' abc123 ')).toBe('ABC123');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.class.findMany).toHaveBeenCalledTimes(1);
  });
  test('manual collision returns only a code-field error', async () => {
    const tx = fixture(true, 1);
    await expect(resolveClassCode(tx as any, 'ABC123')).rejects.toBeInstanceOf(ClassCodeCollisionError);
  });
  test('an unchanged legacy code can be edited even if historical duplicates exist', async () => {
    const tx = fixture(true, 1, ' abc123 ');
    expect(await resolveClassCode(tx as any, 'ABC123', { classId: 'self' })).toBe(' abc123 ');
    expect(tx.class.findMany).toHaveBeenCalledTimes(1);
  });
  test('generated candidates retry, then return the available code', async () => {
    const tx = fixture(true, 1);
    const generate = mock(() => 'NEW123');
    expect(await resolveClassCode(tx as any, 'ABC123', { generated: true, generate })).toBe('NEW123');
    expect(tx.class.findMany).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  test('generated exhaustion stops after four checks', async () => {
    const tx = fixture(true, 20);
    const generate = mock(() => 'ABC123');
    await expect(resolveClassCode(tx as any, 'ABC123', { generated: true, generate })).rejects.toBeInstanceOf(ClassCodeCollisionError);
    expect(tx.class.findMany).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(3);
  });
});
