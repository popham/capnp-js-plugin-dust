var dust = require('dustjs-helpers');
var union = require('./union');

dust.helpers.verbatim = function (chunk, context, bodies, params) {
    var aside = chunk.data;
    var main;
    for (k in bodies) {
        if (k === 'block') {
            chunk.data = [];
            main = bodies[k](chunk, context).data.join('');
        } else {
            throw new Error('verbatim helper only supports a basic block');
        }
    }

    chunk.data = aside;
    return main;
};

dust.helpers.boolOffset = function (chunk, context, bodies, params) {
    return chunk.write(params.offset >>> 3);
};

dust.helpers.boolMask = function (chunk, context, bodies, params) {
    return chunk.write(params.offset & 0x00000007);
};

dust.helpers.constant = function (chunk, context, bodies, params) {
    /* {@constant name="xyzAsdf"/} -> XYZ_ASDF */
    /* Insert '_' before any caps that are not the string's first letter. */
    var text = dust.helpers.tap(params.name, chunk, context);
    var newText = text[0];
    for (var i=1; i<text.length; ++i) {
        if (/[A-Z]/.test(text[i])) {
            newText = newText + '_';
        }
        newText = newText + text[i];
    }

    return chunk.write(newText.toUpperCase());
};

var prependCamel = function (head, camel) {
   return head + camel[0].toUpperCase() + camel.slice(1);
};

dust.helpers.fieldIser = function (chunk, context, bodies, params) {
    /* {@fieldIser name="xyzAsdf"/} -> isXyzAsdf */
    var text = dust.helpers.tap(params.name, chunk, context);
    return chunk.write(prependCamel('is', text));
};

dust.helpers.fieldIniter = function (chunk, context, bodies, params) {
    /* {@fieldIniter name="xyzAsdf"/} -> initXyzAsdf */
    var text = dust.helpers.tap(params.name, chunk, context);
    return chunk.write(prependCamel('init', text));
};

dust.helpers.fieldGetter = function (chunk, context, bodies, params) {
    /* {@fieldGetter name="xyzAsdf"/} -> getXyzAsdf */
    var text = dust.helpers.tap(params.name, chunk, context);
    return chunk.write(prependCamel('get', text));
};

dust.helpers.fieldSetter = function (chunk, context, bodies, params) {
    /* {@fieldSetter name="xyzAsdf"/} -> setXyzAsdf */
    var text = dust.helpers.tap(params.name, chunk, context);
    return chunk.write(prependCamel('set', text));
};

dust.helpers.fieldHaser = function (chunk, context, bodies, params) {
    /* {@fieldHaser name="xyzAsdf"/} -> hasXyzAsdf */
    var text = dust.helpers.tap(params.name, chunk, context);
    return chunk.write(prependCamel('has', text));
};

dust.helpers.fieldAdopter = function (chunk, context, bodies, params) {
    /* {@fieldAdopter name="xyzAsdf"/} -> adoptXyzAsdf */
    var text = dust.helpers.tap(params.name, chunk, context);
    return chunk.write(prependCamel('adopt', text));
};

dust.helpers.fieldDisowner = function (chunk, context, bodies, params) {
    /* {@fieldDisowner name="xyzAsdf"/} -> disownXyzAsdf */
    var text = dust.helpers.tap(params.name, chunk, context);
    return chunk.write(prependCamel('disown', text));
};

dust.helpers.structSize = function (chunk, context, bodies, params) {
    /* {@structSize dataWords=1 pointersWords=2/} -> 24 */
    var data = dust.helpers.tap(params.dataWords, chunk, context) << 3;
    var pointers = dust.helpers.tap(params.pointersWords, chunk, context) << 3;
    return chunk.write(data + pointers);
};

dust.helpers.assert = function (chunk, context, bodies, params) {
    var value = dust.helpers.tap(params.value, chunk, context);
    var expect = dust.helpers.tap(params.expect, chunk, context);
    if (value !== expect) {
        throw new Error('Failed assertion: '+value+' !== '+expect);
    }

    return chunk.write('');
};

dust.helpers.ctThrow = function (chunk, context, bodies, params) {
    throw new Error(params.message);
};

dust.helpers.partial = function (chunk, context, bodies, params) {
    /*
     * dustmotes-provide analogue to bind context for evaluation of a partial
     * template.
     */
    var aside = chunk.data;

    var name;
    var next = {};
    for (var k in bodies) {
        if (k === 'block') {
            name = bodies[k](chunk, context).data.join().trim();
        } else {
            chunk.data = [];
            next[k] = bodies[k](chunk, context);
        }
    }

    chunk.data = aside;
    return chunk.partial(name, context.push(next), params);
};

dust.helpers.partial = function (chunk, context, bodies, params) {
    /*
     * dustmotes-provide analogue to bind context for evaluation of a partial
     * template.
     */
    var aside = chunk.data;

    var name;
    var next = {};
    for (var k in bodies) {
        if (k === 'block') {
            name = bodies[k](chunk, context).data.join().trim();
        } else {
            chunk.data = [];
            next[k] = bodies[k](chunk, context);
        }
    }

    chunk.data = aside;
    return chunk.partial(name, context.push(next), params);
};

dust.helpers.provide = function (chunk, context, bodies, params) {
    /*
     * dustmotes-provide variant.
     */
    var k;
    var aside = chunk.data;

    var main;
    var next = {};
    for (k in bodies) {
        if (k === 'block') {
            main = bodies[k];
        } else {
            chunk.data = [];
            next[k] = bodies[k](chunk, context);
        }
    }

    var current = context.current();
    for (k in current) {
        // Bias context toward the JSON model.
        next[k] = current[k];
    }

    chunk.data = aside;
    return chunk.render(main, context.push(next));
};

dust.helpers.unionBits = function (chunk, context, bodies, params) {
    /*
     * Bias results toward consolidated bytes (e.g. '0,1,2,3,4,5,6,7' doesn't
     * appear in the resulting data structure, but does show up in the result of
     * `union.bytes`).
     *
     * {@union.bits fields=.fields/}
     * ->
     * [{
     *     position : 5,
     *     mask : 0xfe
     * }, {
     *     position : 8,
     *     mask : 0xfc
     * }]
     */
    var fields = dust.helpers.tap(params.fields, chunk, context);
    return union.bits(fields);
};

dust.helpers.unionBytes = function (chunk, context, bodies, params) {
    /*
     * Include any consolidated bytes from the provided bits.
     *
     * {@parseUnionBytes fields=.fields/}
     * ->
     * [{
     *     position : 4,
     *     length : 2
     * }, {
     *     position : 9,
     *     length : 1
     * }]
     */
    var fields = dust.helpers.tap(params.fields, chunk, context);
    return union.bytes(fields);
};

dust.helpers.unionPointers = function (chunk, context, bodies, params) {
    /* {@union.pointers fields=.fields/} -> [16, 32, 40] */
    var fields = dust.helpers.tap(params.fields, chunk, context);
    return union.pointers(fields);
};

dust.helpers.nullListPointer = function (chunk, context, bodies, params) {
    var type = dust.helpers.tap(params.type, chunk, context);

    var pointer = new Buffer(8);
    pointer[0] = 1;
    for (var i=1; i<8; ++i) {
        pointer[i] = 0x00;
    }

    if (type.meta) {
        switch (type.meta) {
        case "enum": pointer[4] = 0x03; break;
        case "struct": pointer[4] = 0x00; break;
        case "list": pointer[4] = 0x06; break;
        default: throw new Error("Lists of meta '"+type.meta+"' are not supported");
        }
    } else {
        switch (type) {
        case "Void": pointer[4] = 0x00; break;
        case "Bool": pointer[4] = 0x01; break;
        case "Int8":
        case "UInt8":
        case "Data": pointer[4] = 0x02; break;
        case "Text":
            pointer = new Buffer(16);
            pointer[0] = 1;
            for (var i=1; i<16; ++i) {
                pointer[i] = 0x00;
            }
            pointer[4] = (1 << 3) | 0x02; // Length of one for the null byte.

            return pointer.toString('base64');
        case "Int16":
        case "UInt16": pointer[4] = 0x03; break;
        case "Int32":
        case "UInt32":
        case "Float32": pointer[4] = 0x04; break;
        case "Int64":
        case "UInt64":
        case "Float64": pointer[4] = 0x05; break;
        case "AnyPointer": pointer[4] = 0x06; break;
        default: throw new Error("Lists of type '"+type+"' are not supported");
        }
    }

    return pointer.toString('base64');
};

dust.helpers.dataBytes = function (chunk, context, bodies, params) {
    var layout = dust.helpers.tap(params.layout, chunk, context);

    switch (layout) {
    case 0x00: return chunk.write('0');
    case 0x01: return chunk.write('null');
    case 0x02: return chunk.write('1');
    case 0x03: return chunk.write('2');
    case 0x04: return chunk.write('4');
    case 0x05: return chunk.write('8');
    case 0x06: return chunk.write('0');
    case 0x07: return chunk.write(context.get('.dataWordCount') << 3);
    default : throw new Error("Cannot compute dataBytes for layout '"+layout+"'");
    }
};

dust.helpers.pointersBytes = function (chunk, context, bodies, params) {
    var layout = dust.helpers.tap(params.layout, chunk, context);

    switch (layout) {
    case 0x00: return chunk.write('0');
    case 0x01: return chunk.write('null');
    case 0x02: return chunk.write('0');
    case 0x03: return chunk.write('0');
    case 0x04: return chunk.write('0');
    case 0x05: return chunk.write('0');
    case 0x06: return chunk.write('8');
    case 0x07: return chunk.write(context.get('.pointerCount') << 3);
    default : throw new Error("Cannot compute pointersBytes for layout '"+layout+"'");
    }
};

dust.helpers.imports = function (chunk, context, bodies, params) {
    var file = dust.helpers.tap(params.file, chunk, context);
    var imports = context.get('.imports');
    var files = imports.map(function (i) {
        i = i.split('/');
        i[i.length-1] += '.d';
        i.push(file);
        if (i[0] === '') {
            // Absolute path
            i.shift();
        } else {
            // Relative path
            //
            // Capnproto file f.capnp -> f.capnp.d/files, so to find relative
            // resources I need to navigate up a directory.
            if (i[0] === '.') i[0] = '..';
            else i.unshift('..');
        }

        return i.join('/');
    });

    return chunk.write("'" + files.join("','") + "'");
};

dust.helpers.bytesFields = function (chunk, context, bodies, params) {
    var fields = dust.helpers.tap(params.fields, chunk, context);

    var pointers = [];
    fields.forEach(function (field) {
        if (field.meta !== undefined) {
            switch (field.meta) {
            case 'struct': pointers.push(field); break;
            case 'list': pointers.push(field); break;
            }
        } else {
            switch (field.type) {
            case 'AnyPointer': pointers.push(field); break;
            case 'Text': pointers.push(field); break;
            case 'Data': pointers.push(field); break;
            case 'Float32': pointers.push(field); break;
            case 'Float64': pointers.push(field); break;
            }
        }
    });

    return pointers;
};

module.exports = dust;
