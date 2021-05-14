const slugify = require('slugify');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const debug = require('debug')('gridsome-source-printful');

const createDirectory = dir => {
  const pwd = path.join(process.cwd(), dir);

  if (!fs.existsSync(pwd)) {
    fs.mkdirSync(pwd);
  }

  return pwd;
};

class PrintfulSource {
  static defaultOptions() {
    return {
      typeName: 'Printful',
      objectTypes: ['SyncProduct', 'WarehouseProduct', 'Country', 'TaxRate'],
      secretKey: null,
      paginationLimit: 20,
      downloadFiles: false,
      downloadProductThumbnail: true, //to keep backwards compatibility
      downloadProductImages: false,
      imageDirectory: 'printful_images',
    };
  }

  constructor(api, options) {
    this.options = options;
    api.loadSource(args => this.fetchContent(args));
  }

  getPrintfulClient() {
    const { apiKey } = this.options;

    const client = axios.create({
      baseURL: 'https://api.printful.com',
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey).toString('base64')}`,
      },
    });
    client.interceptors.request.use(function(config) {
      debug(`${config.method.toUpperCase()} ${config.url}`);
      return config;
    });

    return client;
  }

  /**
   * Download the images locally
   *
   * @param {*} pwd
   * @param {*} prefix
   * @param {*} imageUrl
   */
  async downloadImage(pwd, prefix, imageUrl) {
    if (!imageUrl) {
      return null;
    }
    let filename = `${prefix}_${imageUrl
      .split('/')
      .pop()
      .toLowerCase()}`;

    filename = filename.split('?')
      .shift();

    const filePath = path.resolve(pwd, filename);

    if (fs.existsSync(filePath)) {
      debug(`Image ${filename} already downloaded `);
      return filePath;
    }

    return new Promise((resolve, reject) => {
      debug(`Downloading ${imageUrl}`);
      const file = fs.createWriteStream(filePath);

      https
        .get(imageUrl, response => {
          response.pipe(file);
          file.on('finish', () => {
            console.info('Download finished!');
            file.close(() => resolve(filePath));
          });
        })
        .on('error', err => {
          console.error(`Error on processing image ${filename}`);
          console.error(err.message);
          fs.unlink(filePath, err => {
            if (err) {
              reject(err);
            }

            debug(`Removed the ${filePath} image correct`);
            resolve(filePath);
          });
        });
    });
  }

  async getAllItems({ url }) {
    const printful = this.getPrintfulClient();
    const { paginationLimit } = this.options;

    let records = [];
    let keepGoing = true;
    let offset = 0;

    while (keepGoing) {
      const {
        data: { paging, result },
      } = await printful.get(
        `${url}?limit=${paginationLimit}&offset=${offset}`,
      );
      records = [...records, ...result];
      offset += paginationLimit;

      if (result.length < paginationLimit || paging.total === records.length) {
        keepGoing = false;

        return records;
      }
    }
    return records;
  }

  async fetchSyncProduct({ pwd, addCollection }) {
    const { downloadFiles, downloadProductThumbnail, downloadProductImages, typeName } = this.options;
    const printful = this.getPrintfulClient();

    const result = await this.getAllItems({ url: 'sync/products' });
    const products = await Promise.all(
      result.map(async ({ id }) =>
        printful
          .get(`sync/products/${id}`)
          .then(({ data: { result: { sync_product, sync_variants } } }) => ({
            ...sync_product,
            variants: sync_variants.map(o => ({
              ...o,
              retail_price: parseFloat(o.retail_price),
            })),
          })),
      ),
    );

    if (downloadFiles) {
      await Promise.all(
        products.map(async node => {
          if (node.thumbnail_url && downloadProductThumbnail) {
            node.thumbnail_img = await this.downloadImage(
              pwd,
              node.id,
              node.thumbnail_url,
            );
          }

          if (node.variants && downloadProductImages) {
            for (const variant of node.variants) {
              if (variant.files !== undefined) {
                for (const file of variant.files) {
                  file.thumbnail_img = await this.downloadImage(
                    pwd,
                    file.id,
                    file.thumbnail_url,
                  );

                  file.preview_img = await this.downloadImage(
                    pwd,
                    file.id,
                    file.preview_url,
                  );
                }
              }
            }
          }

        }),
      );
    }

    // add slug
    const contentType = addCollection({ typeName: `${typeName}SyncProduct` });
    products.map(async node => {
      if (node.name) {
        node.slug = slugify(node.name, { lower: true });
      }

      debug(`Add node SyncProduct ${node.id}`);
      return contentType.addNode(node);
    });
  }

  /**
   * Retrieve all warehouse products
   *
   * @param {*} param0
   */
  async fetchWarehouseProduct({ pwd, addCollection }) {
    debug('fetchWarehouseProducts');
    const { downloadFiles, typeName } = this.options;

    const products = await this.getAllItems({ url: 'warehouse/products' });

    // if (downloadFiles) {
    //   await Promise.all(
    //     products.map(async node => {
    //       if (node.thumbnail_url) {
    //         node.thumbnail_img = await this.downloadImage(
    //           pwd,
    //           node.id,
    //           node.thumbnail_url
    //         );
    //       }
    //     })
    //   );
    // }

    // add slug
    const contentType = addCollection({
      typeName: `${typeName}WarehouseProduct`,
    });
    products.map(async node => {
      if (node.name) {
        node.slug = slugify(node.name, { lower: true });
      }

      debug(`Add node WarehouseProduct ${node.id}`);
      return contentType.addNode(node);
    });
  }

  /**
   * fetch countries
   * @param {*} param0
   */
  async fetchCountry({ addCollection }) {
    debug('fetchCountries');
    const { typeName } = this.options;
    const printful = this.getPrintfulClient();

    const {
      data: { result: countries },
    } = await printful.get(`countries`);

    const contentType = addCollection({ typeName: `${typeName}Country` });
    countries.map(async node => {
      node.id = node.code;
      if (node.name) {
        node.slug = slugify(node.name, { lower: true });
      }
      debug(`Add node Country ${node.id}`);
      return contentType.addNode(node);
    });
  }

  /**
   * fetch tax rates
   * @param {*} param0
   */
  async fetchTaxRate({ addCollection }) {
    const { typeName } = this.options;
    const printful = this.getPrintfulClient();

    const {
      data: { result: countries },
    } = await printful.get(`tax/countries`);

    const contentType = addCollection({ typeName: `${typeName}TaxRate` });
    countries.map(async node => {
      if (node.name) {
        node.slug = slugify(node.name, { lower: true });
      }

      debug(`Add node TaxRate ${node.id}`);
      return contentType.addNode(node);
    });
  }

  /**
   * fetch Content
   */
  async fetchContent(store) {
    const { addCollection } = store;
    const { downloadFiles, objectTypes } = this.options;

    let pwd;
    if (downloadFiles) {
      pwd = createDirectory(this.options.imageDirectory);
    }

    await Promise.all(
      objectTypes
        .map(objectType => `fetch${objectType}`)
        .filter(method => {
          !this[method] && console.error(`method ${method} doesn't exists`);
          return !!this[method];
        })
        .map(method =>
          this[method]({
            pwd,
            addCollection,
          }),
        ),
    );
  }
}

module.exports = PrintfulSource;
