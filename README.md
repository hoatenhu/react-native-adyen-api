# ⚡️ react-native-adyen-api

An easy way to call the make a payment api to the Adyen terminal when you use react-native.


---

## Installation


```sh
npm install --save react-native-adyen-api

```

```sh
yarn add react-native-adyen-api

```

## Important: Replace `crypto-browserify`

Because this library uses react-native-quick-crypto so you can not use react-native-debugger or browser to debug normally, you can use flipper
and you may need an extra step:

If you are using a library that depends on `crypto`, instead of polyfilling it with `crypto-browserify` (or `react-native-crypto`) you can use `react-native-quick-crypto` for a fully native implementation. This way you can get much faster crypto operations with just a single-line change!

In your `babel.config.js`, add a module resolver to replace `crypto` with `react-native-quick-crypto`:

```diff
module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  plugins: [
+   [
+     'module-resolver',
+     {
+       alias: {
+         'crypto': 'react-native-quick-crypto',
+         'stream': 'stream-browserify',
+         'buffer': '@craftzdog/react-native-buffer',
+       },
+     },
+   ],
    ...
  ],
};
```

Then restart your bundler using `yarn start --reset-cache`.

Now, all imports for `crypto` will be resolved as `react-native-quick-crypto` instead.

> 💡 Since react-native-quick-crypto depends on `stream` and `buffer`, we can resolve those to `stream-browserify` and @craftzdog's `react-native-buffer` (which is faster than `buffer` because it uses JSI for base64 encoding and decoding).

## Usage

For example, you just need to create an object containing the config information of the adyen terminal:

```js
const config = 
{
  amount: 100,
  saleId: "618ca3fc-5272-4184-a1c2",
  terminalIp: "192.168.1.19",
  poiid: "S1F2-000158212621330",
  securityId: '1',
  passphrare: '1',
  securityVersion: 1,
  currency: "SGD",
}

const response = await makeLocalPayment(config)
```

---


## License

MIT
