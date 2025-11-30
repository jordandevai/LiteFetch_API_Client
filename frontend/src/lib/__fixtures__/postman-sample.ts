export const samplePostmanCollection = {
  info: { name: 'Sample Postman Import' },
  item: [
    {
      name: 'Primary Request',
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              'const data = pm.response.json();',
              "pm.environment.set('alpha_value', data.alpha.beta);",
              "pm.environment.set('cached_flag', data.cached || false);",
            ],
          },
        },
      ],
      request: {
        method: 'GET',
        url: { raw: 'https://api.example.com/foo' },
        header: [{ key: 'accept', value: 'application/json' }],
      },
    },
    {
      name: 'Helper Set Wrapper',
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              'const d = pm.response.json();',
              'const set = (k, v) => pm.environment.set(k, v);',
              "set('links_next', d.links?.next || '/fallback');",
            ],
          },
        },
      ],
      request: {
        method: 'POST',
        url: { raw: 'https://api.example.com/bar' },
        body: {
          mode: 'urlencoded',
          urlencoded: [{ key: 'foo', value: 'bar', disabled: false }],
        },
      },
    },
    {
      name: 'Form Data Upload',
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              'const data = pm.response.json();',
              "pm.environment.set('upload_photo_id', data.photo_id);",
            ],
          },
        },
      ],
      request: {
        method: 'POST',
        url: { raw: 'https://api.example.com/upload' },
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'file', type: 'file', src: '/tmp/photo.png' },
            { key: 'appraisal_id', value: '{{appraisal_id}}' },
          ],
        },
      },
    },
  ],
};
