from pydantic import BaseModel, constr


class WebWunderRequest(BaseModel):
    street: constr(strip_whitespace=True, min_length=1)
    house_number: constr(strip_whitespace=True, min_length=1)
    city: constr(strip_whitespace=True, min_length=1)
    plz: constr(strip_whitespace=True, min_length=1)
    country_code: constr(strip_whitespace=True, min_length=1)

    def to_xml(self) -> str:
        return f"""
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:gs="http://webwunder.gendev7.check24.fun/offerservice">
  <soapenv:Header/>
  <soapenv:Body>
    <gs:legacyGetInternetOffers>
      <gs:input>
        <gs:installation>true</gs:installation>
        <gs:connectionEnum>DSL</gs:connectionEnum>
        <gs:address>
          <gs:street>{self.street}</gs:street>
          <gs:houseNumber>{self.house_number}</gs:houseNumber>
          <gs:city>{self.city}</gs:city>
          <gs:plz>{self.plz}</gs:plz>
          <gs:countryCode>{self.country_code}</gs:countryCode>
        </gs:address>
      </gs:input>
    </gs:legacyGetInternetOffers>
  </soapenv:Body>
</soapenv:Envelope>
""".strip()
