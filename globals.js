Object.filter = ( obj, key_filter ) => {
    const result = {};
    for( let k in obj ) {
        if( key_filter(k,obj[k]) )
            result[k] = obj[k];
    }
    return result;
}
Object.forEach = ( obj, proc ) => {
    for( let k in obj ) {
        proc(k,obj[k]);
    }
    return obj;
}
Object.map = ( obj, key_hasher, value_hasher ) => {
    const result = {};
    for( let k in obj ) {
        const key = key_hasher(k,obj[k]);
        result[key] = value_hasher ? value_hasher(k,obj[k],result[key]) : obj[k];
    }
    return result;
}
Array.dedupe = ( arr ) => {
    return Object.keys(Object.map(arr,(ndx,value)=>value));
}

