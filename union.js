var range = function (position, length) {
    return {
        position : position,
        length : length
    };
};

/*
 * Extract the offsets to every bit that belongs to `branch`.
 */
var bits = function (branch) {
    if (branch.meta !== undefined) return [];

    switch (branch.type) {
    case "Bool": return [branch.offset >>> 0];
    case "group":
        return branch.fields.reduce(function (acc, field) {
            return acc.concat(bits(field));
        }, []);
    }

    return [];
};

/*
 * Partition a list of bits into masks or byte offsets.  Masks of 0x00 get
 * converted to byte offsets.
 */
var partitionBits = function (bits) {
    // Unions may induce multiple bits with the same offset, so use a hash to
    // consolidate.

    var actives = {};
    bits.forEach(function (offset) {
        var i = offset >>> 3;
        var b = actives[i] || 0x00;
        b |= 0x01 << (offset & 0x07);
        actives[i] = b;
    });

    var bytes = [];
    var masks = [];
    for (var i in actives) {
        if (actives[i] === 0xff) {
            bytes.push(range(i >>> 0, 1));
        } else {
            masks.push({
                position : i >>> 0,
                mask : 0xff & ~actives[i]
            });
        }
    }

    return {
        bytes : bytes,
        masks : masks
    };
};

/*
 * Extract the offsets to every byte that belongs to `branch`.
 */
var bytes = function (branch) {
    switch (branch.meta) {
    case "enum": return [range(2*branch.offset, 2)];
    case "struct":
    case "list":
    case "capability": return [];
    }

    switch (branch.type) {
    case "Int8":
    case "UInt8": return [range(branch.offset, 1)];
    case "Int16":
    case "UInt16": return [range(2*branch.offset, 2)];
    case "Int32":
    case "UInt32":
    case "Float32": return [range(4*branch.offset, 4)];
    case "Int64":
    case "UInt64":
    case "Float64": return [range(8*branch.offset, 8)];
    case "group":
        return branch.fields.reduce(function (acc, field) {
            return acc.concat(bytes(field));
        }, []);
    }

    return [];
};

/*
 * Extract the offsets to every pointer that belong to `branch`.
 */
var pointers = function (branch) {
    switch (branch.meta) {
    case "list":
    case "struct" : return [8*branch.offset];
    }

    switch (branch.type) {
    case "AnyPointer": return [8*branch.offset];
    case "group":
        return branch.fields.reduce(function (acc, field) {
            return acc.concat(pointers(field));
        }, []);
    }

    return [];
};

exports.bits = function (fields) {
    /*
     * Extract bitmasks for all of the fields that are union members.  The
     * results bias toward consolidated bytes (e.g. '0,1,2,3,4,5,6,7' doesn't
     * appear in the resulting data structure, but does show up in the result of
     * `union.bytes`).
     *
     * {@union.bits fields=./}
     * ->
     * [{
     *     position : 0,
     *     mask : 0x9c (10011100)
     * }, {
     *     position : 1,
     *     mask : 0x7f (01111111)
     * }]
     */

    // Gather each field's masks into a single data structure.
    var masks = fields.reduce(function (acc, field) {
        if (field.discriminantValue !== 65535) {
            return acc.concat(partitionBits(bits(field)).masks);
        }

        return acc;
    }, []);

    // Lump together masks so that overlaps can be joined.
    masks.sort(function (lhs, rhs) {
        return rhs.position - lhs.position;
    });

    // If a bitmask overlaps with `bytes`, then ignore it.  Convert to a hash
    // for constant time lookups (at compile-time).
    var excludes = {};
    fields.forEach(function (field) {
        if (field.discriminantValue !== 65535) {
            var bs = bytes(field);
            bs.forEach(function (b) {
                for (var i=0; i<b.length; ++i) {
                    excludes[b.position + i] = true;
                }
            });
        }
    });

    return masks.reduce(function (acc, boolField) {
        if (excludes[boolField.position]) return acc;

        var last = acc[acc.length-1];
        if (last && last.position === boolField.position) {
            last.mask &= boolField.mask;
        } else {
            acc.push(boolField);
        }

        return acc;
    }, []);
};

exports.bytes = function (fields) {
    /*
     * Extract byte ranges for all of the fields that are union members.  This
     * data set includes any bitmasks that consolidated to a full byte.
     */
    var includes = fields.reduce(function (acc, field) {
        if (field.discriminantValue !== 65535) {
            return acc.concat(
                partitionBits(bits(field)).bytes
            ).concat(
                bytes(field)
            );
        }

        return acc;
    }, []);

    if (includes.length === 0) {
        return [];
    }

    includes.sort(function (lhs, rhs) {
        return lhs.position - rhs.position;
    });

    var current = includes[0];
    var results = [];
    var i = 0;
    while (i < includes.length) {
        var joint = includes[i];
        do {
            // Candidate length for `joint`.
            var ell = current.position + current.length - joint.position;

            /*
             * If the current iterant's interval is a subset of the `joint`
             * interval, then retain the `joint` interval's length.
             */
            joint.length = Math.max(joint.length, ell);
            current = includes[++i];
        } while (current && joint.position+joint.length >= current.position);
        results.push(joint);
    }

    return results;
};

exports.pointers = function (fields) {
    /*
     * Extract the pointers for all of the fields that are union members.
     */
    var ps = fields.reduce(function (acc, field) {
        if (field.discriminantValue !== 65535) {
            return acc.concat(pointers(field));
        }

        return acc;
    }, []);

    ps.sort(function (lhs, rhs) {
        return rhs - lhs;
    });

    return ps.reduce(function (acc, p) {
        if (acc[acc.length-1] !== p) {
            acc.push(p);
        }

        return acc;
    }, []);
};
