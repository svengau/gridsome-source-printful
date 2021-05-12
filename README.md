# Gridsome Source for Printful

Source plugin for fetching data from [Printful](https://www.printful.com/) into [Gridsome](https://gridsome.org/).

## Install

`npm install --save gridsome-source-printful`

or

`yarn add gridsome-source-printful`

## How to use

```javascript
// In your gridsome.config.js
plugins: [
  {
    use: 'gridsome-source-printful',
    options: {
      objectTypes: ['SyncProduct', 'WarehouseProduct', 'Country', 'TaxRate'],
      apiKey: 'xxxxxxxxx',
      // optional params
      downloadFiles: true, //enable file downloading in general
      downloadProductThumbnail: true, //downloads the thumbnail of the product and the applied design
      downloadProductImages: true, //downloads all other images (thumbnail + preview) that are coming from printful in .variant.files 
      imageDirectory: 'printful_images',
    },
  },
];
```

if downloadFiles is `true` the plugin will download all assets associated to fields `image` and `images` into `imageDirectory`.

## How to query and filter

For example, you can query the product nodes created from Printful with the following:

```javascript
query {
  allPrintfulProduct {
    edges {
      node {
        id
        external_id
        name
        slug
        thumbnail_url
        thumbnail_img (width: 100 height: 100)
        __typename
        variants {
          id
          variant_id
          external_id
          sync_product_id
          retail_price
          currency
          name
          sku
          files {
            id
            filename
            thumbnail_url
          }
        }
      }
    }
  }
}

```

and you can filter specific node using this:

```javascript
query product($id: String!) {
  printfulProduct(id: $id) {
    id
    external_id
    name
  }
}
```

Another example with the countries:

```javascript
query {
  allPrintfulCountry {
    totalCount
    edges {
      node {
        id
        name
        code
        states {code name}
      }
    }
  }
}
```

## Documentation

The official Printful API documentation is [here](https://www.printful.com/docs/products)

## Thanks

This plugin has been:

- largely inspired by the great [Gatsby-source-printful](https://github.com/ynnoj/gatsby-source-printful) developed by [Jonathan Steele](https://twitter.com/ynnoj)
- developed with the kind support of [Fullstack Rocket](https://www.fullstackrocket.com/)
