import RNFetchBlob from "rn-fetch-blob";
import { Buffer } from "buffer";
import NexoCrypto from "./crypto/nexo-crypto";

export const makeLocalPayment = async ({
  amount,
  saleId,
  terminalIp,
  poiid,
  securityId,
  passphrare,
  securityVersion,
  currency,
}) => {
  const id = Math.floor(Math.random() * Math.floor(10000000)).toString();

  const requestBody = {
    SaleToPOIRequest: {
      MessageHeader: {
        ProtocolVersion: "3.0",
        MessageClass: "Service",
        MessageCategory: "Payment",
        MessageType: "Request",
        SaleID: saleId,
        ServiceID: id,
        POIID: poiid,
      },
      PaymentRequest: {
        SaleData: {
          SaleTransactionID: {
            TransactionID: id,
            TimeStamp: new Date().toISOString().replace("Z", "+00:00"),
          },
        },
        PaymentTransaction: {
          AmountsReq: {
            Currency: currency,
            RequestedAmount: amount,
          },
        },
      },
    },
  };

  const nexoCrypto = new NexoCrypto();
  nexoCrypto.configure(securityId, passphrare, +securityVersion);
  const requestBodyBytes = Buffer.from(JSON.stringify(requestBody), "utf8");
  const securedRequestBody = nexoCrypto.encrypt_and_hmac(requestBodyBytes);

  const result = await RNFetchBlob.config({ trusty: true })
    .fetch(
      "POST",
      `https://${terminalIp}:8443/nexo`,
      {
        "Content-Type": "application/json",
        // "x-API-key":
        //   "AQEqhmfxKYrIbRVKw0m/n3Q5qf3VboRCCYlLSHbavPOVxKQ4nMd517VgsWwfEMFdWw2+5HzctViMSCJMYAc=-0K6pydsXvPG84ELXM+rMWCcWcX9HZ1dhavyYFyRE/aE=-]Z4Ewy[D#9e<N8<q",
      },
      JSON.stringify({
        SaleToPOIRequest: {
          MessageHeader: requestBody.SaleToPOIRequest.MessageHeader,
          NexoBlob: securedRequestBody.SaleToPOIRequest.NexoBlob,
          SecurityTrailer: securedRequestBody.SaleToPOIRequest.SecurityTrailer,
        },
      })
    )
    .then((resp) => {
      const respBytes = Buffer.from(resp.data, "utf8");
      const decryptResp = nexoCrypto.decrypt_and_validate_hmac(respBytes);
      const jsonDecryptResp = JSON.parse(decryptResp);

      console.log("decryptResp: ", decryptResp);

      return jsonDecryptResp;
    })
    .catch((e) => {
      console.log(e);
      return null;
    });
  return result;
};

module.exports = makeLocalPayment;
