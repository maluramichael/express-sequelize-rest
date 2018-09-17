const { Op } = require('sequelize');
const Debug = require('debug');
const R = require('ramda');

const debug = Debug('express-sequelize-rest');
const createFilter = (req, Models) => {

  const result = {};

  result.limit = Number(req.query.limit || 10);
  result.offset = Number(req.query.offset || 0);

  if (req.query.attributes) {
    try {
      result.attributes = req.query.attributes.split(',');
    } catch (error) {
    }
  }

  const mapIncludes = (includes) => {
    return R.map((include) => {
      const clone = R.clone(include);
      if (clone.include) {
        clone.include = mapIncludes(clone.include);
      }
      return R.mergeDeepRight(clone, { model: Models[include.model] });
    }, includes);
  };

  if (req.query.include && Models) {
    try {
      let includes = JSON.parse(req.query.include);
      result.include = mapIncludes(includes);
    } catch (error) {
    }
  }

  if (req.query.order) {

    try {
      result.order = R.map(R.split('='), R.split(';', req.query.order));
    } catch (error) {
    }
  }

  return result;
};

const getSequelizeErrors = (error) => {
  return {
    name: error.name,
    errors: error.errors ? R.map(R.prop('message'), error.errors) : {
      message: error.message,
      stack: error.stack.split('\n')
    }
  };
};

function Getter(Model) {
  return function addOptions(options) {
    return function middlware(req, res, next) {
      const where = R.mapObjIndexed((value) => ({ [Op.eq]: value }), req.params);
      return Model.findOne({
        where,
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

function Lister(Model, Models) {
  return function addOptions(options) {
    debug('lister.options: %O', options);
    return function middleware(req, res, next) {
      debug('lister.middleware: %O', req.body);

      let query = {
        include: [{ all: true }],
      };

      query = R.mergeDeepRight(query, options || {});
      query = R.mergeDeepRight(query, createFilter(req, Models));

      return Model.findAndCountAll(query).then(results => {
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
        return Model.find({
          where: {
            id: { [Op.eq]: result.id }
          },
          include: [{ all: true }]
        }).then((fullData) => {
          res.locals.data = fullData;
          next();
          return fullData;
        }).catch((error) => {
          debug('creator.middleware.Model.find.error: %O', error);
          return next({ status: 500, message: `Could not create ${Model.name}`, details: getSequelizeErrors(error) });
        });
      }).catch(error => {
        debug('creator.middleware.Model.build.error: %O', error);
        return next({ status: 500, message: `Could not create ${Model.name}`, details: getSequelizeErrors(error) });
      });
    };
  };
}

function Updater(Model) {
  return function addOptions(options) {
    return function middleware(req, res, next) {
      const where = R.mapObjIndexed((value) => ({ [Op.eq]: value }), req.params);
      return Model.findOne({
        where,
        ...options
      }).then(function (element) {
        if (element) {
          return element.update(req.body).then(function (instance) {
            res.locals.data = instance;
            next();
            return instance;
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
      const where = R.mapObjIndexed((value) => ({ [Op.eq]: value }), req.params);
      return Model.find({
        where
      }).then(result => {
        if (result) {
          return result.destroy().then(() => {
            res.json({});
          });
        } else {
          res.json({});
        }
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
  CreateRestMiddleware(Model, Models) {
    return {
      Getter: Getter(Model, Models),
      Lister: Lister(Model, Models),
      Creator: Creator(Model, Models),
      Updater: Updater(Model, Models),
      Deleter: Deleter(Model, Models)
    };
  },
  Responder,
  getSequelizeErrors
};
