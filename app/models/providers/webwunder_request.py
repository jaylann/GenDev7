from pydantic import BaseModel


class WebWunderRequest(BaseModel):
    street: str
    house_number: str
    city: str
    plz: str
    country_code: str

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