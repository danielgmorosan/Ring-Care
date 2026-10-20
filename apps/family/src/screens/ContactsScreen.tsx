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
import {
  Avatar,
  Body,
  Button,
  Card,
  Caption,
  Chip,
  Divider,
  Field,
  PageHeader,
  Screen,
  SectionHeader,
  TextAction,
} from '../components/ui';
import { color, font, radius, space, text } from '../theme/tokens';
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
        <PageHeader title="People" subtitle="Who belongs, and who we call" />

        <View style={{ gap: space[3] }}>
          <SectionHeader icon="home" label="Household" />
          <Body muted>
            The people the guardian should recognize. Photos and face data stay on the guardian
            phone; here you keep only a name and a role.
          </Body>
          {(people.data ?? []).length > 0 ? (
            <Card style={st.list}>
              {(people.data ?? []).map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={st.personRow}>
                    <Avatar name={p.title} size={44} />
                    <View style={st.nameCol}>
                      <Text style={st.name} numberOfLines={1}>
                        {p.title}
                      </Text>
                      <Caption>{ROLE_LABEL[p.role]}</Caption>
                    </View>
                    {p.role === 'resident' ? <Chip tone="accent">Protected</Chip> : null}
                    <TextAction
                      label="Remove"
                      danger
                      onPress={() => void deletePerson.mutate(p.id)}
                    />
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
          {people.data?.length === 0 ? (
            <Card>
              <Body muted>No one enrolled yet. Add the people who live here or visit often.</Body>
            </Card>
          ) : null}
        </View>

        <Card style={{ gap: space[4] }}>
          <SectionHeader icon="plus" label="Enroll someone" />
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

        <View style={{ gap: space[3] }}>
          <SectionHeader icon="phone-call" label="Who we call, in order" />
          {(contacts.data ?? []).length > 0 ? (
            <Card style={st.list}>
              {(contacts.data ?? []).map((c, i) => (
                <View key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={st.contact}>
                    <View style={st.contactTop}>
                      <View style={st.order}>
                        <Text style={st.orderText}>{i + 1}</Text>
                      </View>
                      <Avatar name={c.name} size={48} />
                      <View style={st.nameCol}>
                        <Text style={st.name} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Caption>{`${c.role}${c.phone ? ` · ${c.phone}` : ''}`}</Caption>
                        {i === 0 || c.quietHours ? (
                          <View style={st.chips}>
                            {i === 0 ? <Chip tone="accent">Called first</Chip> : null}
                            {c.quietHours ? (
                              <Chip tone="attention" dot>
                                Quiet hours
                              </Chip>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={st.contactBottom}>
                      <View style={st.actions}>
                        <TextAction label="Edit" onPress={() => startEdit(c)} />
                        <TextAction
                          label="Remove"
                          danger
                          onPress={() => void deleteContact.mutate(c.id)}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
          {contacts.data?.length === 0 ? (
            <Card>
              <Body muted>No contacts yet. Add the first person we should call.</Body>
            </Card>
          ) : null}
        </View>

        <Card style={{ gap: space[4] }}>
          <SectionHeader
            icon={editingId ? 'pencil' : 'plus'}
            label={editingId ? 'Edit contact' : 'Add a contact'}
          />
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
  list: { paddingVertical: space[1], paddingHorizontal: space[4] },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 68 },
  nameCol: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...font.semibold, fontSize: 17, color: color.textPrimary },
  contact: { paddingVertical: space[3], gap: space[2] },
  contactTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  contactBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space[2],
    paddingLeft: 24 + space[3],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },
  actions: { flexDirection: 'row', gap: space[3], marginLeft: 'auto' },
  order: {
    marginTop: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: { ...font.bold, fontSize: 12, color: color.textInverse },
  roleLabel: { ...font.semibold, fontSize: text.sm, color: color.textPrimary },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  rolePill: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.bgSunken,
  },
  rolePillOn: { backgroundColor: color.ink },
  rolePillText: { ...font.medium, fontSize: text.sm, color: color.textSecondary },
  rolePillTextOn: { ...font.semibold, color: color.textInverse },
});
