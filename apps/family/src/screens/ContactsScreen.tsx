import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  useContacts,
  useCreateContact,
  useCreatePerson,
  useDeleteContact,
  useDeletePerson,
  usePeople,
  useUpdateContact,
} from '../api/hooks';
import type { Contact, HouseholdRole } from '../api/types';
import { Body, Button, Card, Caption, Chip, Field, H1, H2, Screen } from '../components/ui';
import { color, radius, space, text } from '../theme/tokens';
import { StyleSheet, Text } from 'react-native';

const ROLES: { key: HouseholdRole; label: string }[] = [
  { key: 'resident', label: 'Resident' },
  { key: 'family', label: 'Family' },
  { key: 'caregiver', label: 'Caregiver' },
  { key: 'friend', label: 'Friend' },
  { key: 'other', label: 'Other' },
];

const ROLE_LABEL: Record<HouseholdRole, string> = {
  resident: 'Resident',
  family: 'Family',
  caregiver: 'Caregiver',
  friend: 'Friend',
  other: 'Other',
};

/** The escalation contact chain, wired to the real backend CRUD (family from the token). */
export function ContactsScreen() {
  const contacts = useContacts();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const people = usePeople();
  const createPerson = useCreatePerson();
  const deletePerson = useDeletePerson();
  const [personTitle, setPersonTitle] = useState('');
  const [personRole, setPersonRole] = useState<HouseholdRole>('family');
  const [personError, setPersonError] = useState<string | null>(null);

  async function addPerson() {
    setPersonError(null);
    try {
      await createPerson.mutateAsync({ title: personTitle.trim(), role: personRole });
      setPersonTitle('');
      setPersonRole('family');
    } catch (e) {
      setPersonError((e as Error).message);
    }
  }

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setRole('');
    setPhone('');
    setEditingId(null);
  }

  function startEdit(c: Contact) {
    setName(c.name);
    setRole(c.role);
    setPhone(c.phone ?? '');
    setEditingId(c.id);
    setError(null);
  }

  async function save() {
    setError(null);
    const body = { name: name.trim(), role: role.trim(), phone: phone.trim() || undefined };
    try {
      if (editingId) {
        await updateContact.mutateAsync({ id: editingId, body });
      } else {
        await createContact.mutateAsync({ ...body, priority: contacts.data?.length ?? 0 });
      }
      resetForm();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Screen>
      <View style={{ padding: space[6], gap: space[5] }}>
        <View style={{ gap: space[1] }}>
          <Caption>WHO BELONGS</Caption>
          <H1>Household</H1>
          <Body muted>
            The people the guardian should recognize. Photos and face data stay on the guardian
            phone; here you keep only a name and a role.
          </Body>
        </View>

        <View style={{ gap: space[3] }}>
          {(people.data ?? []).map((p) => (
            <Card key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1 }}>
                <Body>{p.title}</Body>
                <Caption>{ROLE_LABEL[p.role]}</Caption>
              </View>
              {p.role === 'resident' ? <Chip tone="accent">Protected</Chip> : null}
              <Pressable onPress={() => void deletePerson.mutate(p.id)} hitSlop={10}>
                <Text style={st.remove}>Remove</Text>
              </Pressable>
            </Card>
          ))}
          {people.data?.length === 0 ? (
            <Card>
              <Body muted>No one enrolled yet. Add the people who live here or visit often.</Body>
            </Card>
          ) : null}
        </View>

        <Card style={{ gap: space[4] }}>
          <Caption>ENROLL SOMEONE</Caption>
          <Field
            label="Name or title"
            placeholder="Grandfather"
            value={personTitle}
            onChangeText={setPersonTitle}
            autoCapitalize="words"
          />
          <View style={{ gap: space[2] }}>
            <Text style={st.roleLabel}>Role</Text>
            <View style={st.roleRow}>
              {ROLES.map((r) => {
                const selected = r.key === personRole;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => setPersonRole(r.key)}
                    style={[st.rolePill, selected && st.rolePillOn]}
                  >
                    <Text style={[st.rolePillText, selected && st.rolePillTextOn]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Button
            label="Add to household"
            onPress={addPerson}
            loading={createPerson.isPending}
            disabled={personTitle.trim().length === 0}
          />
          {personError ? <Caption>{`Could not save: ${personError}`}</Caption> : null}
        </Card>

        <View style={{ gap: space[1] }}>
          <Caption>WHO WE CALL, IN ORDER</Caption>
          <H2>Escalation chain</H2>
        </View>

        <View style={{ gap: space[3] }}>
          {(contacts.data ?? []).map((c, i) => (
            <Card key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={st.avatar}>
                <Text style={st.avatarText}>{c.name.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Body>{c.name}</Body>
                <Caption>{`${c.role}${c.phone ? ` · ${c.phone}` : ''}`}</Caption>
              </View>
              {i === 0 ? <Chip tone="accent">Called first</Chip> : null}
              {c.quietHours ? <Chip tone="attention">Quiet hours</Chip> : null}
              <Pressable onPress={() => startEdit(c)} hitSlop={10}>
                <Text style={st.edit}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => void deleteContact.mutate(c.id)} hitSlop={10}>
                <Text style={st.remove}>Remove</Text>
              </Pressable>
            </Card>
          ))}
          {contacts.data?.length === 0 ? (
            <Card>
              <Body muted>No contacts yet. Add the first person we should call.</Body>
            </Card>
          ) : null}
        </View>

        <Card style={{ gap: space[4] }}>
          <Caption>{editingId ? 'EDIT CONTACT' : 'ADD A CONTACT'}</Caption>
          <Field
            label="Name"
            placeholder="Ana"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <Field label="Role" placeholder="Daughter" value={role} onChangeText={setRole} />
          <Field
            label="Phone"
            placeholder="+351912345678"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            hint="Optional. Use the international format, e.g. +351912345678."
          />
          <Button
            label={editingId ? 'Save changes' : 'Add to chain'}
            onPress={save}
            loading={createContact.isPending || updateContact.isPending}
            disabled={name.trim().length === 0 || role.trim().length === 0}
          />
          {editingId ? <Button label="Cancel" variant="ghost" onPress={resetForm} /> : null}
          {error ? <Caption>{`Could not save: ${error}`}</Caption> : null}
        </Card>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(83,104,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: color.action, fontWeight: '600', fontSize: text.sm },
  edit: { color: color.action, fontSize: text.sm, fontWeight: '600' },
  remove: { color: color.incident500, fontSize: text.sm, fontWeight: '600' },
  roleLabel: { fontSize: text.md, fontWeight: '600', color: color.textPrimary },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  rolePill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    backgroundColor: color.bgSurface,
  },
  rolePillOn: { backgroundColor: color.pink500, borderColor: color.pink500 },
  rolePillText: { fontSize: text.sm, fontWeight: '600', color: color.textSecondary },
  rolePillTextOn: { color: '#fff' },
});
