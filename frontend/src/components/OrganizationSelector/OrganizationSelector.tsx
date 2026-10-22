import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import { setActiveOrganization } from '../../store/organization-slice.js';

interface OrganizationSelectorProps {
  /** Style the select for the dark app bar instead of the light menu. */
  onDark?: boolean;
}

function OrganizationSelector({ onDark = false }: OrganizationSelectorProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const organizations = useAppSelector(state => state.organization.organizations);
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);

  if (organizations.length === 0) {
    return null;
  }

  const handleChange = (event: SelectChangeEvent<string>) => {
    dispatch(setActiveOrganization(event.target.value));
  };

  return (
    <Select
      size="small"
      value={activeOrganizationId ?? ''}
      onChange={handleChange}
      inputProps={{ 'aria-label': t('nav.selectOrganization') }}
      sx={{
        minWidth: 160,
        ...(onDark
          ? {
              color: 'common.white',
              '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.5)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
              '.MuiSelect-icon': { color: 'common.white' },
            }
          : {}),
      }}
    >
      {organizations.map(organization => (
        <MenuItem key={organization.id} value={organization.id}>
          {organization.name}
        </MenuItem>
      ))}
    </Select>
  );
}

export default OrganizationSelector;
