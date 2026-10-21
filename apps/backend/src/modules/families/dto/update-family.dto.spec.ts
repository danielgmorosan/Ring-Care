import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateFamilyDto } from './update-family.dto';
import { CreateFamilyDto } from './create-family.dto';

async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateFamilyDto, body);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors: errors.map((e) => e.property) };
}

describe('UpdateFamilyDto elder fields', () => {
  it('accepts a name and a known relation', async () => {
    const { dto, errors } = await check({ elderName: 'Maria', elderRelation: 'mother' });
    expect(errors).toEqual([]);
    expect(dto.elderName).toBe('Maria');
    expect(dto.elderRelation).toBe('mother');
  });

  it('accepts accents, spaces, apostrophes and hyphens', async () => {
    for (const name of ['Zé', 'Maria da Conceição', 'Anne-Marie', "D'Arcy"]) {
      expect((await check({ elderName: name })).errors).toEqual([]);
    }
  });

  it('trims the name', async () => {
    const { dto, errors } = await check({ elderName: '  Maria  ' });
    expect(errors).toEqual([]);
    expect(dto.elderName).toBe('Maria');
  });

  it('treats a blank name as clearing it', async () => {
    const { dto, errors } = await check({ elderName: '   ' });
    expect(errors).toEqual([]);
    expect(dto.elderName).toBeNull();
  });

  it('accepts null to clear either field', async () => {
    const { dto, errors } = await check({ elderName: null, elderRelation: null });
    expect(errors).toEqual([]);
    expect(dto.elderName).toBeNull();
    expect(dto.elderRelation).toBeNull();
  });

  it('rejects a name over 60 characters', async () => {
    expect((await check({ elderName: 'a'.repeat(61) })).errors).toEqual(['elderName']);
    expect((await check({ elderName: 'a'.repeat(60) })).errors).toEqual([]);
  });

  it('rejects control and bidi override characters', async () => {
    for (const name of ['Ma\nria', 'Ma\tria', 'Ma\u0000ria', 'Ma\u202Eria', 'Ma\u2028ria']) {
      expect((await check({ elderName: name })).errors).toEqual(['elderName']);
    }
  });

  it('rejects a non-string name and an unknown relation', async () => {
    expect((await check({ elderName: 42 })).errors).toEqual(['elderName']);
    expect((await check({ elderRelation: 'aunt' })).errors).toEqual(['elderRelation']);
  });

  it('applies the same rules on create', async () => {
    const dto = plainToInstance(CreateFamilyDto, { name: 'Silva', elderName: 'Ma\nria' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['elderName']);
  });
});
