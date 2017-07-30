const extra = req => (
  { params: { ...req.query, ...req.params } }
);

export function sendNotFound(req, res) {
  sendFail(req, res, 404, 'Not Found');
}

export function sendFail(req, res, status, error) {
  res.status(status).send({
    ...extra(req),
    success: false,
    error: error.message ? error.message : error,
  });
}

export function sendSuccess(req, res, data) {
  res.send({
    ...extra(req),
    success: true,
    data,
  });
}

export function errorSender(req, res) {
  return (e) => {
    sendFail(req, res, 500, e);
  };
}

export function dataSender(req, res) {
  return (data) => {
    sendSuccess(req, res, data);
  };
}
