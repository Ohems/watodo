import { sendFail } from './sender';

const validateParamSet = (rawParams, validators) => {
  const errors = [];
  const params = rawParams || {};

  Object.keys(validators).forEach((key) => {
    const validator = validators[key];

    if (params[key] === undefined && validator.required) {
      errors.push(`Obligatory parameter ${key} not found`);
    } else if (!validator.check(params[key], validator.options)) {
      errors.push(`Invalid parameter, '${key}' didn't pass ${validator.check.name} test${
        validator.options ? ` with rules${
          Object.keys(validator.options).map(key =>
            ` ${key}:${validator.options[key]}`
          )
        }` : ''
      }`);
    }
  });

  return errors;
};

export default function validate(req, res, validators) {
  let errors = [];

  if (validators.query) {
    errors = errors.concat(validateParamSet(req.query, validators.query));
  }

  if (validators.params) {
    errors = errors.concat(validateParamSet(req.params, validators.params));
  }

  if (errors.length > 0) {
    sendFail(req, res, 400, errors);
    return false;
  }

  return true;
}
