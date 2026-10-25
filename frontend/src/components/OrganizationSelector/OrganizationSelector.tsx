import { Select } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useGetMyOrganizationsQuery } from '../../api/index.js';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import {
  selectActiveOrganizationId,
  setActiveOrganization,
} from '../../store/organization-slice.js';

interface OrganizationSelectorProps {
  /** Style the select for the dark app bar instead of the light menu. */
  onDark?: boolean;
}

function OrganizationSelector({ onDark = false }: OrganizationSelectorProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { data: organizations = [] } = useGetMyOrganizationsQuery();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);

  if (organizations.length === 0) {
    return null;
  }

  const data = organizations.map(organization => ({
    value: organization.id,
    label: organization.name,
  }));

  return (
    <Select
      size="sm"
      data={data}
      value={activeOrganizationId ?? null}
      onChange={value => {
        if (value) dispatch(setActiveOrganization(value));
      }}
      aria-label={t('nav.selectOrganization')}
      styles={
        onDark
          ? {
              input: {
                minWidth: 160,
                backgroundColor: 'transparent',
                color: 'white',
                borderColor: 'rgba(255, 255, 255, 0.5)',
              },
              dropdown: {
                color: 'black',
              },
            }
          : { input: { minWidth: 160 } }
      }
      comboboxProps={{ withinPortal: true }}
    />
  );
}

export default OrganizationSelector;
