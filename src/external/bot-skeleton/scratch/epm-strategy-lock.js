// Locks a saved strategy (.xml) into a scrambled, site-only file before it
// leaves the browser, so a file saved from this site can't be opened as XML
// by another tool or bot builder -- it just looks like random bytes, and
// its extension (.epmbot) isn't recognised as a strategy file anywhere else.
//
// This is a deterrent against casual copying (sharing the file, importing it
// into another bot builder), not a vault: the key below ships inside this
// app's JS bundle, so someone willing to read the compiled app code could
// still recover it. True secrecy would mean never sending the strategy to
// the browser at all.

const MAGIC = new TextEncoder().encode('EPMLOCK1');
export const LOCKED_FILE_EXTENSION = 'epmbot';

// Static app-wide key (not a user secret). Only gates casual file sharing --
// see the file header above.
const RAW_KEY_HEX = '443683e62ae26bc4cc0ed7d258627b3859d5df2996216cf9103c8081a91b290c';

const hexToBytes = hex => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
};

let key_promise = null;
const getKey = () => {
    if (!key_promise) {
        key_promise = crypto.subtle.importKey('raw', hexToBytes(RAW_KEY_HEX), 'AES-GCM', false, [
            'encrypt',
            'decrypt',
        ]);
    }
    return key_promise;
};

/** XML text -> locked bytes (magic header + iv + ciphertext), ready to save as a Blob. */
export const lockStrategy = async xml_text => {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(xml_text);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));

    const out = new Uint8Array(MAGIC.length + iv.length + cipher.length);
    out.set(MAGIC, 0);
    out.set(iv, MAGIC.length);
    out.set(cipher, MAGIC.length + iv.length);
    return out;
};

/** True if this buffer starts with our lock header (i.e. was saved by this site). */
export const isLockedBuffer = array_buffer => {
    const bytes = new Uint8Array(array_buffer);
    if (bytes.length < MAGIC.length) return false;
    return MAGIC.every((b, i) => bytes[i] === b);
};

/** Locked bytes -> original XML text. Throws if the file wasn't locked by this site. */
export const unlockStrategy = async array_buffer => {
    const bytes = new Uint8Array(array_buffer);
    const iv = bytes.slice(MAGIC.length, MAGIC.length + 12);
    const cipher = bytes.slice(MAGIC.length + 12);
    const key = await getKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
};
