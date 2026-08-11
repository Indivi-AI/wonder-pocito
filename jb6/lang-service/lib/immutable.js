const commands = {
    $push: (value, nextObject) => value.length ? nextObject.concat(value) : nextObject,
    $splice(value, nextObject, originalObject) {
      value.forEach(args => {
        if (nextObject === originalObject && args.length) nextObject = copy(originalObject)
        nextObject.splice(...args)
      })
      return nextObject
    },
    $set: x => x,
    $merge(value, nextObject, originalObject) {
      Object.keys(value).forEach(key => {
        if (value[key] !== nextObject[key]) {
          if (nextObject === originalObject) nextObject = copy(originalObject);
          nextObject[key] = value[key]
        }
      })
      return nextObject
    }
}

export function update(object, spec) {
    var nextObject = object
    Object.keys(spec).forEach(key => {
      if (commands[key]) {
        var objectWasNextObject = object === nextObject
        nextObject = commands[key](spec[key], nextObject, object)
        if (objectWasNextObject && nextObject === object)
          nextObject = object
      } else {
        var nextValueForKey = update(object[key], spec[key])
        var nextObjectValue = nextObject[key]
        if (nextValueForKey !== nextObjectValue || typeof nextValueForKey === 'undefined' && !object.hasOwnProperty(key)) {
          if (nextObject === object)
            nextObject = copy(object)
          nextObject[key] = nextValueForKey;
        }
      }
    })
    return nextObject
}

function copy(obj) {
    const res = Array.isArray(obj) ? obj.slice(0) : (obj && typeof obj === 'object') ? Object.assign({}, obj) : obj
    jb.ext.db?.watchable && (res[jb.ext.db.watchable.jbId] = obj[jb.ext.db.watchable.jbId])
    return res
}

