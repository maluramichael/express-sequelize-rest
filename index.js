const { Op } = require('sequelize');
const Debug = require('debug');
const R = require('ramda');

const debug = Debug('express-sequelize-rest');
const createFilter = req => {
  // limit: Number(req.query._end) - Number(req.query._start),
  // offset: Number(req.query._start),
  // order: [
  //   [req.query._sort, req.query._order]
  // ]
  return {};
};

const getSequelizeErrors = (error) => {
  return { name: error.name, errors: R.map(R.prop('message'), error.errors) };
}

function Getter(Model) {
  return function addOptions(options) {
    return function middlware(req, res, next) {
      return Model.findOne({
        where: {
          id: { [Op.eq]: req.params.id }
        },
        include: [{ all: true }],
        ...options
      }).then(element => {
        if (element) {
          res.locals.data = element;
          next();
          return element;
        } else {
          next({ status: 404, message: 'Instance not found' });
          return false;
        }
      }).catch(error => {
        return next({ status: 500, message: `Could not get ${Model.name}`, details: getSequelizeErrors(error) });
      });
    };
  };
}

function Lister(Model) {
  return function addOptions(options) {
    debug('lister.options: %O', options);
    return function middleware(req, res, next) {
      debug('lister.middleware: %O', req.body);
      return Model.findAndCountAll({
        ...createFilter(req),
        include: [{ all: true }],
        ...options
      }).then(results => {
        res.locals.data = results.rows;
        next();
        return results.rows;
      }).catch(error => {
        debug('lister.middleware.Model.error: %O', error);
        return next({ status: 500, message: `Could not list ${Model.name}`, details: getSequelizeErrors(error) });
      });
    };
  };
}

function Creator(Model) {
  return function addOptions(options) {
    debug('creator.options: %O', options);
    return function middleware(req, res, next) {
      debug('creator.middleware: %O', req.body);
      return Model.build(req.body, (options || {})).save().then(result => {
        debug('creator.middleware.Model.build: %O', result);
        res.locals.data = result;
        next();
        return result;
      }).catch(error => {
        debug('creator.middleware.Model.build.error: %O', error);
        return next({ status: 500, message: `Could not create ${Model.name}`, details: getSequelizeErrors(error) });
      });
    };
  };
}

function Updater(Model) {
  return function addOptions(options) {
    return function middleware(req, res) {
      return Model.findOne({
        where: {
          id: { [Op.eq]: req.params.id }
        },
        ...options
      }).then(function (element) {
        if (element) {
          element.update(req.body).then(function (instance) {
            res.json(instance);
          }).catch(function (error) {
            return next({ status: 500, error });
          });
        } else {
          return next({ status: 404, error });
        }
      }).catch(error => {
        return next({ status: 500, message: `Could not patch ${Model.name}`, details: getSequelizeErrors(error) });
      });
    };
  };
}

function Deleter(Model) {
  return function addOptions(options) {
    return function middlware(req, res) {
      return Model.destroy({
        where: {
          id: { [Op.eq]: req.params.id }
        },
        ...options
      }).then(result => {
        res.json({});
      }).catch(error => {
        return next({ status: 500, message: `Could not delete ${Model.name}`, details: getSequelizeErrors(error) });
      });
    };
  };
}

function Responder(status = 200) {
  return function (req, res) {
    debug('responder req: %s', JSON.stringify(req.body));
    if (res.locals.data) {
      if (R.is(Array, res.locals.data)) {
        res.header('X-Total-Count', res.locals.data.length);
      } else if (R.is(Object, res.locals.data)) {
        res.header('X-Total-Count', 1);
      }
    }
    res.status(status);
    res.json(res.locals.data);
  };
}

module.exports = {
  CreateRestMiddleware(Model) {
    return {
      Getter: Getter(Model),
      Lister: Lister(Model),
      Creator: Creator(Model),
      Updater: Updater(Model),
      Deleter: Deleter(Model)
    };
  },
  Responder
}