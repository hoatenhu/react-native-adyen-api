import {
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'react-native-quick-crypto';

const NEXO_HMAC_KEY_LENGTH = 32;
const NEXO_CIPHER_KEY_LENGTH = 32;
const NEXO_IV_LENGTH = 16;

class NexoCrypto {
  constructor() {}

  configure(passphrase, keyIdentifier, keyVersion) {
    if (passphrase) {
      this.derivedKeys = this.deriveKeyMaterial(passphrase);
    }

    this.keyIdentifier = keyIdentifier;
    this.keyVersion = keyVersion || 0;
  }

  /**
   * Derive key material given a passphrase.
   * @var $passphrase string
   * @returns a 3-element array containing the derived key material
   */
  deriveKeyMaterial(passphrase) {
    var pass = Buffer.from(passphrase, 'binary');
    const salt = Buffer.from('AdyenNexoV1Salt', 'binary');
    const iterations = 4000;
    const keylen =
      NEXO_HMAC_KEY_LENGTH + NEXO_CIPHER_KEY_LENGTH + NEXO_IV_LENGTH;

    const key = pbkdf2Sync(pass, salt, iterations, keylen, 'sha1');

    var ret = {
      key: key,
      hmac_key: key.slice(0, 32),
      cipher_key: key.slice(32, 64),
      iv: key.slice(64, 80),
    };
    return ret;
  }

  /**
   * Encrypt or decrypt data given a iv modifier and using the specified key
   * The actual iv is computed by taking the iv from the key material and xoring it with ivmod
   */
  crypt(bytes, dk, ivmod, encrypt) {
    // xor dk.iv and the iv modifier
    var actualIV = Buffer.alloc(NEXO_IV_LENGTH);
    for (var i = 0; i < NEXO_IV_LENGTH; i++) {
      actualIV[i] = dk.iv[i] ^ ivmod[i];
    }

    var cipher;
    if (encrypt) {
      cipher = createCipheriv('aes-256-cbc', dk.cipher_key, actualIV);
    } else {
      cipher = createDecipheriv('aes-256-cbc', dk.cipher_key, actualIV);
    }

    var data = cipher.update(bytes);
    data = Buffer.concat([data, cipher.final()]);

    return data;
  }

  /**
   * Compute a hmac using the hmac_key
   */
  hmac(bytes, dk) {
    var mac = createHmac('sha256', dk.hmac_key);
    var hmac = mac.update(bytes).digest(); //hex ?
    return hmac;
  }

  /**
   * Encrypt and compose a secured Nexo message
   *
   * This functions takes the original message, encrypts it and converts the encrypted form to Base64 and
   * names it NexoBlob.
   * After that, a new message is created with a copy of the header, the NexoBlob and an added SecurityTrailer.
   *
   * @param in is the byte representation of the unprotected Nexo message
   * @returns a byte representation of the secured Nexo message
   */
  encrypt_and_hmac(bytes) {
    // parse the json
    var body = JSON.parse(bytes);

    // and determined if it is a request or responce
    var request = true;
    var saletopoirequest = false; // add missing semicolon to end statement // Check if it's a SaleToPOIRequest message
    if (body.SaleToPOIRequest) {
      body = body.SaleToPOIRequest;
      saletopoirequest = true;
    }

    // Check if it's a SaleToPOIResponse message
    if (body.SaleToPOIResponse) {
      body = body.SaleToPOIResponse;
      request = false;
      saletopoirequest = true;
    }

    // create the IV modifier
    const ivmod = randomBytes(NEXO_IV_LENGTH);

    // encrypt the body
    const encryptedBody = this.crypt(
      Buffer.from(JSON.stringify(body), 'binary'),
      this.derivedKeys,
      ivmod,
      true,
    );

    // add the SecurityTrailer
    const securityTrailer = {
      KeyIdentifier: this.keyIdentifier,
      Hmac: '',
      KeyVersion: this.keyVersion,
      AdyenCryptoVersion: 1,
      Nonce: ivmod.toString('base64'),
    };

    // create the hmac of the encryptedBody
    securityTrailer.Hmac = this.hmac(bytes, this.derivedKeys).toString(
      'base64',
    );

    // prepare the NexoBlob and base64 encode it
    var encbytes = this.crypt(bytes, this.derivedKeys, ivmod, true);
    // const nexoBlob = Buffer.concat([
    //   encryptedBody,
    //   Buffer.from(JSON.stringify(securityTrailer), 'binary'),
    // ]);
    const base64NexoBlob = encbytes.toString('base64');

    // create the secured message and return it as bytes
    const securedMessage = {
      SaleToPOIRequest: {
        MessageHeader: {
          ProtocolVersion: '3.0',
          MessageClass: request ? 'Service' : 'Device',
          MessageCategory: request ? 'Payment' : 'Response',
          MessageType: saletopoirequest ? 'Request' : 'Response',
          SaleID: 'POSSystemID',
          ServiceID: 'AdyenPaymentService',
          POIID: 'V400m-324688042',
        },
        NexoBlob: base64NexoBlob,
        SecurityTrailer: securityTrailer,
      },
    };

    // return Buffer.from(JSON.stringify(securedMessage), 'binary');
    return securedMessage;
  }

  decrypt_and_validate_hmac(bytes) {
    // parse the json
    var body = JSON.parse(bytes);

    // and determined if it is a request or responce
    var request = true;
    var saletopoirequest = body['SaleToPOIRequest'];
    if (!saletopoirequest) {
      request = false;
      saletopoirequest = body['SaleToPOIResponse'];
    }

    // pick up the MessageHeader
    var messageHeader = saletopoirequest['MessageHeader'];
    var payload = saletopoirequest['NexoBlob'];
    var ciphertext = Buffer.from(payload, 'base64');

    // Get the SecurityTrailer and its values
    var jsonTrailer = saletopoirequest['SecurityTrailer'];
    var version = jsonTrailer['AdyenCryptoVersion'];

    var nonceB64 = jsonTrailer['Nonce'];
    var ivmod = Buffer.from(nonceB64, 'base64');

    var keyId = jsonTrailer['KeyIdentifier'];
    var kversion = jsonTrailer['KeyVersion'];
    var hmacB64 = jsonTrailer['Hmac'];

    var ret = this.crypt(ciphertext, this.derivedKeys, ivmod, false);
    var json = JSON.parse(ret);

    // Base64 decode the received HMAC and compare it to a computed hmac
    // Use a timing safe compare, this is to mitigate a (theoretical) timing based attack
    var receivedmac = Buffer.from(hmacB64, 'base64');
    var hmac = this.hmac(ret, this.derivedKeys);

    //console.log(receivedmac);
    //console.log(hmac);

    if (receivedmac.length != hmac.length) {
      // console.log("HMAC Validation failed - Length mismatch");
      return;
    }
    var equal = true;
    for (var i = 0; i < hmac.length; i++) {
      if (receivedmac[i] != hmac[i]) {
        equal = false;
      }
    }
    if (!equal) {
      // console.log("HMAC Validation failed - Not Equal");
      return;
    }

    return JSON.stringify(json);
  }
}

export default NexoCrypto;
