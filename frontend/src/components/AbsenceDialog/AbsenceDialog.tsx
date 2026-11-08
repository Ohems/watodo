import { Alert, Button, Group, Modal, Select, Textarea, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getApiErrorMessage,
  useCreateAbsenceMutation,
  useUpdateAbsenceMutation,
} from '../../api/index.js';
import type { Absence, AbsenceType } from '../../types/index.js';

interface AbsenceDialogProps {
  opened: boolean;
  onClose: () => void;
  /** When given, the dialog edits this absence; otherwise it creates a new one. */
  absence?: Absence | null;
}

/**
 * Modal form to add or edit an absence of the current user. Used by the
 * Absences page and the Home quick actions.
 */
function AbsenceDialog({ opened, onClose, absence }: AbsenceDialogProps) {
  const { t } = useTranslation();
  const isEditing = absence != null;

  const [type, setType] = useState<AbsenceType>('away');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [createAbsence] = useCreateAbsenceMutation();
  const [updateAbsence] = useUpdateAbsenceMutation();

  useEffect(() => {
    if (opened) {
      setType(absence?.type ?? 'away');
      setDescription(absence?.description ?? '');
      setStartDate(absence?.startDate ?? '');
      setEndDate(absence?.endDate ?? '');
      setError(null);
    }
  }, [opened, absence]);

  const typeOptions = [
    { value: 'sick', label: t('absences.typeSick') },
    { value: 'away', label: t('absences.typeAway') },
    { value: 'other', label: t('absences.typeOther') },
  ];

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      if (isEditing && absence) {
        await updateAbsence({
          absenceId: absence.id,
          data: { type, description, startDate, endDate },
        }).unwrap();
      } else {
        await createAbsence({ type, description, startDate, endDate }).unwrap();
      }
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const valid = type !== null && startDate !== '' && endDate !== '' && endDate >= startDate;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditing ? t('absences.editAbsence') : t('absences.newAbsence')}
    >
      {error && (
        <Alert color="red" variant="light" mb="md">
          {error}
        </Alert>
      )}
      <Select
        label={t('absences.type')}
        data={typeOptions}
        value={type}
        onChange={value => setType((value as AbsenceType) ?? 'other')}
        required
        mb="md"
      />
      <Textarea
        label={t('absences.description')}
        value={description}
        onChange={e => setDescription(e.currentTarget.value)}
        mb="md"
      />
      <Group grow mb="md">
        <TextInput
          type="date"
          label={t('absences.startDate')}
          value={startDate}
          onChange={e => setStartDate(e.currentTarget.value)}
          required
        />
        <TextInput
          type="date"
          label={t('absences.endDate')}
          value={endDate}
          onChange={e => setEndDate(e.currentTarget.value)}
          required
        />
      </Group>
      {startDate !== '' && endDate !== '' && endDate < startDate && (
        <Alert color="red" variant="light" mb="md">
          {t('absences.endBeforeStart')}
        </Alert>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={!valid || saving}>
          {t('common.save')}
        </Button>
      </Group>
    </Modal>
  );
}

export default AbsenceDialog;
